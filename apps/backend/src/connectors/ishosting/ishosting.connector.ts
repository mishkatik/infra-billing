import { Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import type { z } from 'zod';
import { createHttp, REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  ISHOSTING_DETAIL_KINDS,
  ishostingServiceNames,
  latestPaidInvoiceByService,
  mapIshostingInvoicedService,
  mapIshostingPayments,
  mapIshostingService,
  parseIshostingMoney,
} from './ishosting.mapper';
import {
  IshostingInvoice,
  IshostingInvoiceLine,
  IshostingService,
  IshostingServiceRef,
  ishostingBalanceInvoicesSchema,
  ishostingErrorSchema,
  ishostingInvoiceDetailSchema,
  ishostingInvoicesSchema,
  ishostingProfileSchema,
  ishostingServiceSchema,
  ishostingServicesListSchema,
} from './ishosting.types';

const BASE_URL = 'https://api.ishosting.com';
// Cloudflare in front of the API blocks the User-Agents of common HTTP clients (curl, node,
// axios, python-requests, Go, …) with a JS challenge; a product name passes.
const USER_AGENT = 'infra-billing';
// Even then the first request after a pause is sometimes challenged; the next one passes.
const CHALLENGE_ATTEMPTS = 3;
const PAGE_LIMIT = 100;
const MAX_PAGES = 100; // safety cap so a broken offset contract can't loop forever

class IshostingApiError extends Error {
  constructor(
    message: string,
    readonly challenged: boolean,
  ) {
    super(message);
    this.name = 'IshostingApiError';
  }
}

// ishosting API (https://api.ishosting.com, spec https://my.ishosting.com/openapi.yaml): no SDK ->
// thin axios client, `X-Api-Token` header. Balance: GET /profile. Services: GET /services/list
// (type + id only), then GET /{type}/{id} for the price, period, next charge and location; kinds
// without that endpoint (subscription, ssl, …) are priced by their newest paid invoice
// (GET /billing/invoice/{id}). Payments: GET /billing/invoices and GET /billing/balance/invoices.
export class IshostingConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(IshostingConnector.name);

  constructor(token: string) {
    this.http = createHttp({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      headers: {
        'X-Api-Token': token.trim(),
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
    // Surface the API's own message instead of axios' error, which carries the request headers
    // (the API token) and would end up in the sync logs.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        const challenged = e.response?.headers['cf-mitigated'] === 'challenge';
        const body = ishostingErrorSchema.safeParse(e.response?.data);
        const reason = challenged
          ? 'blocked by the Cloudflare challenge'
          : body.success
            ? body.data.message
            : e.code;
        throw new IshostingApiError(
          `ishosting: ${reason || 'request failed'}${status ? ` [HTTP ${status}]` : ''}`,
          challenged,
        );
      }
      throw e;
    });
  }

  kind(): string {
    return 'ishosting';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const profile = await this.get('/profile', ishostingProfileSchema, signal);
    const { amount, currency } = parseIshostingMoney(profile.balance);
    return { balance: amount, currency };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    // The list is the inventory: a failure here (or on any service detail) must fail the sync, so
    // nothing is marked inactive.
    const list = await this.get('/services/list', ishostingServicesListSchema, signal);
    const detailed: { kind: string; service: IshostingService }[] = [];
    const invoiced: IshostingServiceRef[] = [];
    for (const ref of list) {
      if (!ISHOSTING_DETAIL_KINDS.has(ref.type)) {
        invoiced.push(ref);
        continue;
      }
      const service = await this.get(`/${ref.type}/${ref.id}`, ishostingServiceSchema, signal);
      detailed.push({ kind: ref.type, service });
    }
    const names = ishostingServiceNames(detailed.map((d) => d.service));
    return [
      ...detailed.map(({ kind, service }) =>
        mapIshostingService(kind, service, names.get(service.id) ?? service.id),
      ),
      ...(await this.mapInvoicedServices(invoiced, signal)),
    ];
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const invoices = await this.fetchInvoices(signal);
    const balance = await this.paginate(
      '/billing/balance/invoices',
      ishostingBalanceInvoicesSchema,
      signal,
    );
    return mapIshostingPayments(invoices, balance);
  }

  /** Best-effort: without its invoice line a service keeps the stored price instead of failing. */
  private async mapInvoicedServices(
    refs: IshostingServiceRef[],
    signal: AbortSignal,
  ): Promise<ServiceData[]> {
    if (!refs.length) return [];
    const lines = new Map<string, IshostingInvoiceLine>();
    try {
      const latest = latestPaidInvoiceByService(
        await this.fetchInvoices(signal),
        new Set(refs.map((r) => r.id)),
      );
      for (const invoiceId of new Set([...latest.values()].map((inv) => inv.id))) {
        const detail = await this.get(
          `/billing/invoice/${invoiceId}`,
          ishostingInvoiceDetailSchema,
          signal,
        );
        for (const line of detail.services) {
          if (latest.get(line.service.id)?.id === invoiceId) lines.set(line.service.id, line);
        }
      }
    } catch (e) {
      if (signal.aborted) throw e;
      this.logger.warn(
        `ishosting: prices of ${refs.map((r) => r.type).join(', ')} unavailable, left as stored: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return refs.map((ref) => mapIshostingInvoicedService(ref, lines.get(ref.id)));
  }

  private fetchInvoices(signal: AbortSignal): Promise<IshostingInvoice[]> {
    return this.paginate('/billing/invoices', ishostingInvoicesSchema, signal);
  }

  /** Walk `limit`/`offset` pages until a short one; rows are deduped by id as offsets can shift. */
  private async paginate<T extends z.ZodTypeAny>(
    path: string,
    schema: z.ZodArray<T>,
    signal: AbortSignal,
  ): Promise<z.infer<T>[]> {
    const byId = new Map<string, z.infer<T>>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = await this.get(path, schema, signal, {
        limit: PAGE_LIMIT,
        offset: page * PAGE_LIMIT,
      });
      for (const row of rows) byId.set(row.id, row);
      if (rows.length < PAGE_LIMIT) return [...byId.values()];
    }
    throw new Error(`ishosting: ${path} pagination limit exceeded`);
  }

  private async get<T extends z.ZodTypeAny>(
    path: string,
    schema: T,
    signal: AbortSignal,
    params?: Record<string, unknown>,
  ): Promise<z.infer<T>> {
    for (let attempt = 1; ; attempt++) {
      try {
        const { data } = await this.http.get(path, { params, signal });
        const parsed = schema.safeParse(data);
        if (!parsed.success) throw new Error(`ishosting: unexpected ${path} response`);
        return parsed.data;
      } catch (e) {
        if (!(e instanceof IshostingApiError && e.challenged) || attempt >= CHALLENGE_ATTEMPTS) {
          throw e;
        }
      }
    }
  }
}
