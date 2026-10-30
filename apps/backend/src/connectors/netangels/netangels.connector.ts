import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { mapNetangelsPayment, mapNetangelsVm } from './netangels.mapper';
import {
  netangelsAccountSchema,
  netangelsCalculationSchema,
  netangelsPageSchema,
  netangelsPaymentMonthsSchema,
  netangelsPaymentsSchema,
  type NetangelsVm,
} from './netangels.types';

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

/**
 * NetAngels gateway API (https://api.netangels.ru/). API key is exchanged for a 24h bearer.
 * The read-only calculation endpoint is also used by the official panel; unlike the VM list,
 * it includes disks, backups, IPs and other add-ons. No hard-coded tariff catalogue.
 */
export class NetangelsConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly authHttp: AxiosInstance;
  private bearer: string | undefined;
  private authPending: Promise<string> | undefined;

  constructor(private readonly apiKey: string) {
    this.http = axios.create({
      baseURL: 'https://api-ms.netangels.ru/api/v1',
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
    });
    this.authHttp = axios.create({
      baseURL: 'https://panel.netangels.ru',
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
    });
  }

  kind(): string {
    return 'netangels';
  }

  private async authenticate(signal: AbortSignal): Promise<string> {
    if (this.bearer) return this.bearer;
    if (!this.authPending) {
      this.authPending = (async () => {
        try {
          const { data } = await this.authHttp.post(
            '/api/gateway/token/',
            new URLSearchParams({ api_key: this.apiKey }).toString(),
            { signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
          );
          if (typeof data?.token !== 'string' || !data.token) {
            throw new Error('NetAngels: token missing from gateway response');
          }
          this.bearer = data.token;
          return data.token as string;
        } catch (error) {
          throw this.safeError(error, 'authentication');
        }
      })();
    }
    try {
      return await this.authPending;
    } finally {
      this.authPending = undefined;
    }
  }

  private safeError(error: unknown, operation: string): Error {
    // Axios errors carry request bodies and Authorization headers: never pass them to sync logs.
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    return new Error(`NetAngels: ${operation} failed${status ? ` (HTTP ${status})` : ''}`);
  }

  private async get(
    path: string,
    signal: AbortSignal,
    params?: Record<string, number>,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.authenticate(signal);
      try {
        const { data } = await this.http.get(path, {
          signal,
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        return data;
      } catch (error) {
        if (attempt === 0 && axios.isAxiosError(error) && error.response?.status === 401) {
          if (this.bearer === token) this.bearer = undefined;
          continue;
        }
        throw this.safeError(error, 'API request');
      }
    }
    throw new Error('NetAngels: authentication retry exhausted');
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const parsed = netangelsAccountSchema.safeParse(await this.get('/account/info/', signal));
    if (!parsed.success) throw new Error('NetAngels: invalid account response');
    return { balance: new Decimal(parsed.data.balance), currency: 'RUB' };
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const months = netangelsPaymentMonthsSchema.safeParse(
      await this.get('/finances/payments/months/', signal),
    );
    if (!months.success) throw new Error('NetAngels: invalid payment months response');
    const out: PaymentData[] = [];
    const seen = new Set<string>();
    for (const month of new Set(months.data.entities)) {
      // The panel uses a full date (day 01), not YYYY-MM, for the monthly ledger endpoint.
      const parsed = netangelsPaymentsSchema.safeParse(
        await this.get(`/finances/payments/${month}-01/`, signal),
      );
      if (!parsed.success) throw new Error('NetAngels: invalid payments response');
      for (const row of parsed.data.payments) {
        const payment = mapNetangelsPayment(row);
        if (!row.event_date.startsWith(`${month}-`))
          throw new Error('NetAngels: payment month mismatch');
        if (seen.has(payment.externalId)) throw new Error('NetAngels: duplicate payment in ledger');
        seen.add(payment.externalId);
        out.push(payment);
      }
    }
    return out;
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const vms: NetangelsVm[] = [];
    const seen = new Set<number>();
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const parsed = netangelsPageSchema.safeParse(
        await this.get('/cloud/vms/', signal, {
          limit: PAGE_LIMIT,
          offset: vms.length,
        }),
      );
      if (!parsed.success) throw new Error('NetAngels: invalid VM list response');
      const { count, entities } = parsed.data;
      for (const vm of entities) {
        if (seen.has(vm.id)) throw new Error('NetAngels: duplicate VM in pagination');
        seen.add(vm.id);
        vms.push(vm);
      }
      if (vms.length === count) {
        complete = true;
        break;
      }
      if (!entities.length || vms.length > count) throw new Error('NetAngels: incomplete VM list');
    }
    if (!complete) throw new Error('NetAngels: VM pagination limit exceeded');
    const existing = vms.filter((vm) => !vm.deleted);
    if (!existing.length) return [];
    const parsed = netangelsCalculationSchema.safeParse(
      await this.get('/cloud/vms/calculation/', signal),
    );
    if (!parsed.success) throw new Error('NetAngels: invalid calculation response');
    const prices = new Map(parsed.data.entities.map((row) => [row.vm_name, row]));
    if (prices.size !== parsed.data.entities.length)
      throw new Error('NetAngels: duplicate calculation');
    return existing.map((vm) => {
      const price = prices.get(vm.uid);
      // Fail the sync rather than silently replacing an existing price with zero or stale data.
      if (!price) throw new Error('NetAngels: VM missing from calculation');
      return mapNetangelsVm(vm, price);
    });
  }
}
