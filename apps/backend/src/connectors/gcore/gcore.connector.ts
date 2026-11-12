import { Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  aggregateGcoreCharges,
  GCORE_RATE_WINDOW_DAYS,
  gcoreAttachmentKey,
  mapGcoreCloudServices,
  mapGcoreFeatureServices,
  mapGcoreTopup,
  toGcoreExpense,
} from './gcore.mapper';
import {
  GcoreCostRow,
  GcoreOperation,
  gcoreAttachmentReportSchema,
  gcoreClientMeSchema,
  gcoreCostReportSchema,
  gcoreOperationsPageSchema,
  gcoreRegionsSchema,
} from './gcore.types';

const BASE_URL = 'https://api.gcore.com';
const OPS_PAGE = 100; // server-side maximum for accounting operations
const OPS_CONCURRENCY = 4;
const MAX_OPS_PAGES = 500; // safety cap
const COST_PAGE = 1000; // v2 cost report maximum (json)
const MAX_COST_PAGES = 50;
const LEDGER_DAYS = 31; // charges window; also covers the 7-day rate window
const DAY_MS = 86_400_000;

type Expense = NonNullable<ReturnType<typeof toGcoreExpense>>;

/** A Gcore API failure that keeps the HTTP status (403/404 drive the fallbacks). */
class GcoreApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
  ) {
    super(message);
  }
}

/**
 * Gcore (https://api.gcore.com), permanent API token: `Authorization: APIKey <token>`.
 *
 * Money always comes from the account's billing ledger (/billing/client/v1), which any token role
 * can read: balance, card payments (top-ups) and expenses (charges, one per feature per day).
 * Services come from the Cloud cost report when the token may read it (Administrators role):
 * one per instance with its attached volumes/IPs. A narrower token gets 403 there, and services
 * fall back to one per billing feature priced from the ledger. Non-Cloud products (CDN, …) always
 * come from the ledger.
 */
export class GcoreConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(GcoreConnector.name);
  private ledger: Promise<{ ops: GcoreOperation[]; from: Date }> | undefined;

  constructor(token: string) {
    const key = token.trim().replace(/^apikey\s+/i, '');
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      headers: { Authorization: `APIKey ${key}`, Accept: 'application/json' },
    });
    // Never let axios errors (with the Authorization header in their config) reach the logs.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        const body = e.response?.data as { detail?: unknown; title?: unknown } | undefined;
        const text = [body?.detail, body?.title].find((t) => typeof t === 'string' && t.trim());
        throw new GcoreApiError(
          `Gcore: ${e.config?.method?.toUpperCase()} ${e.config?.url?.split('?')[0]} failed` +
            `${status ? ` (HTTP ${status})` : e.code ? ` (${e.code})` : ''}${text ? `: ${text}` : ''}`,
          status,
        );
      }
      throw e;
    });
  }

  kind(): string {
    return 'gcore';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get('/billing/v1/clients/me', { signal });
    const me = gcoreClientMeSchema.safeParse(data);
    if (!me.success) throw new Error('Gcore: invalid billing account response');
    const [main] = me.data.balances;
    // A postpaid card account has no prepaid credit: balance 0, usage is charged to the card.
    return {
      balance: main ? new Decimal(main.amount) : new Decimal(0),
      currency: main?.currency ?? 'EUR',
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const now = new Date();
    const [{ ops, from }, cloud] = await Promise.all([
      this.fetchLedger(signal),
      this.fetchCloudServices(now, signal),
    ]);
    const expenses = ops.map(toGcoreExpense).filter((e): e is Expense => e !== null);
    // Ledger features for everything the cost report doesn't cover.
    const features = mapGcoreFeatureServices(
      expenses,
      now,
      ledgerStart(ops, from),
      cloud ? (e) => e.product !== 'CLOUD' : undefined,
    );
    return [...(cloud ?? []), ...features];
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const [topups, { ops }] = await Promise.all([
      this.fetchOperations({ acc: 'client.debit' }, signal),
      this.fetchLedger(signal),
    ]);
    const expenses = ops.map(toGcoreExpense).filter((e): e is Expense => e !== null);
    return [
      ...topups.map(mapGcoreTopup).filter((p): p is PaymentData => p !== null),
      ...aggregateGcoreCharges(expenses),
    ];
  }

  /** Expense ledger for the last {@link LEDGER_DAYS} UTC days; shared by services and payments. */
  private fetchLedger(signal: AbortSignal) {
    if (!this.ledger) {
      const today = new Date(new Date().toISOString().slice(0, 10));
      const from = new Date(today.getTime() - (LEDGER_DAYS - 1) * DAY_MS);
      this.ledger = this.fetchOperations(
        { acc: 'expense', applying_at__from: from.toISOString() },
        signal,
      ).then((ops) => ({ ops, from }));
      this.ledger.catch(() => {
        this.ledger = undefined; // let a later call retry
      });
    }
    return this.ledger;
  }

  /** All accounting operations matching `filter`, oldest first; pages fetched in parallel. */
  private async fetchOperations(
    filter: Record<string, string>,
    signal: AbortSignal,
  ): Promise<GcoreOperation[]> {
    const page = async (offset: number) => {
      const { data } = await this.http.get('/billing/client/v1/accounting/operations', {
        signal,
        params: { ...filter, ordering: 'applying_at', limit: OPS_PAGE, offset },
      });
      const parsed = gcoreOperationsPageSchema.safeParse(data);
      if (!parsed.success) throw new Error('Gcore: invalid accounting operations response');
      return parsed.data;
    };
    const first = await page(0);
    const pages = Math.ceil(first.count / OPS_PAGE);
    if (pages > MAX_OPS_PAGES) throw new Error('Gcore: accounting operations limit exceeded');
    const out = [...first.results];
    for (let p = 1; p < pages; p += OPS_CONCURRENCY) {
      const batch = [];
      for (let i = p; i < Math.min(p + OPS_CONCURRENCY, pages); i++) batch.push(page(i * OPS_PAGE));
      for (const r of await Promise.all(batch)) out.push(...r.results);
    }
    // Offsets can shift if operations land mid-walk; dedupe by id.
    return [...new Map(out.map((o) => [o.id, o])).values()];
  }

  /** Cloud services from the cost report, or null when the token may not read it (403). */
  private async fetchCloudServices(now: Date, signal: AbortSignal): Promise<ServiceData[] | null> {
    const today = new Date(now.toISOString().slice(0, 10));
    const windowStart = new Date(today.getTime() - GCORE_RATE_WINDOW_DAYS * DAY_MS);
    const period = {
      time_from: windowStart.toISOString(),
      time_to: new Date(today.getTime() + DAY_MS).toISOString(), // exclusive → includes today
    };
    let rows: GcoreCostRow[];
    try {
      rows = await this.fetchCostRows(period, signal);
    } catch (e) {
      if (e instanceof GcoreApiError && e.status === 403) {
        this.logger.log('Gcore: token cannot read the Cloud cost report; using ledger services');
        return null;
      }
      throw e;
    }
    if (!rows.length) return [];
    const [attachedTo, countries] = await Promise.all([
      this.fetchAttachments(period, signal),
      this.fetchRegionCountries(signal),
    ]);
    return mapGcoreCloudServices(rows, attachedTo, countries);
  }

  private async fetchCostRows(
    period: { time_from: string; time_to: string },
    signal: AbortSignal,
  ): Promise<GcoreCostRow[]> {
    const out: GcoreCostRow[] = [];
    for (let p = 0; p < MAX_COST_PAGES; p++) {
      const { data } = await this.http.post(
        '/cloud/v2/cost_report/resources',
        { ...period, limit: COST_PAGE, offset: out.length },
        { signal },
      );
      const parsed = gcoreCostReportSchema.safeParse(data);
      if (!parsed.success) throw new Error('Gcore: invalid cost report response');
      out.push(...parsed.data.results);
      if (out.length >= parsed.data.count || !parsed.data.results.length) return out;
    }
    throw new Error('Gcore: cost report pagination limit exceeded');
  }

  /**
   * volume/IP → instance uuid, from the deprecated v1 report (v2 dropped `attached_to_vm`).
   * shortcut: if Gcore removes v1 (404/410), volumes and IPs become separate services.
   */
  private async fetchAttachments(
    period: { time_from: string; time_to: string },
    signal: AbortSignal,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    let offset = 0;
    try {
      for (let p = 0; p < MAX_COST_PAGES; p++) {
        const { data } = await this.http.post(
          '/cloud/v1/cost_report/resources',
          { ...period, types: ['volume', 'external_ip'], limit: 100, offset },
          { signal },
        );
        const parsed = gcoreAttachmentReportSchema.safeParse(data);
        if (!parsed.success) throw new Error('Gcore: invalid v1 cost report response');
        for (const r of parsed.data.results) {
          if (!r.attached_to_vm) continue;
          map.set(gcoreAttachmentKey(r.type, r.uuid, r.ip_address), r.attached_to_vm);
        }
        offset += parsed.data.results.length;
        if (offset >= parsed.data.count || !parsed.data.results.length) return map;
      }
    } catch (e) {
      if (e instanceof GcoreApiError && (e.status === 404 || e.status === 410)) {
        this.logger.warn('Gcore: v1 cost report is gone; volumes/IPs are listed separately');
        return map;
      }
      throw e;
    }
    return map;
  }

  private async fetchRegionCountries(signal: AbortSignal): Promise<Map<number, string>> {
    const { data } = await this.http.get('/cloud/v1/regions', { signal, params: { limit: 1000 } });
    const parsed = gcoreRegionsSchema.safeParse(data);
    if (!parsed.success) throw new Error('Gcore: invalid regions response');
    return new Map(
      parsed.data.results.flatMap((r) =>
        r.country && /^[A-Za-z]{2}$/.test(r.country) ? [[r.id, r.country.toUpperCase()]] : [],
      ),
    );
  }
}

/** Oldest operation actually returned, if the ledger is younger than the requested window. */
function ledgerStart(ops: GcoreOperation[], requestedFrom: Date): Date | null {
  let min: number | null = null;
  for (const o of ops) {
    const t = Date.parse(o.action.applying_at);
    if (!Number.isNaN(t) && (min === null || t < min)) min = t;
  }
  return min !== null && min > requestedFrom.getTime() + DAY_MS ? new Date(min) : null;
}
