import { toDecimal } from '@common/money';
import { Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { normalizeCurrency } from '../common/currency';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  HOSTUP_FALLBACK_CURRENCY,
  isLiveHostupService,
  mapHostupDomain,
  mapHostupSharedHosting,
  mapHostupTransaction,
  mapHostupVps,
} from './hostup.mapper';
import {
  HostupBillingAccount,
  HostupDomain,
  HostupPage,
  HostupPaidPeriod,
  HostupPaidPeriodsResponse,
  HostupProblem,
  HostupSharedHosting,
  HostupTransactionActivity,
  HostupVps,
} from './hostup.types';

const BASE_URL = 'https://cloud.hostup.se/api/v2';
const MAX_PAGES = 50; // safety cap so a misbehaving cursor/page contract can't loop forever
const VPS_PAGE_LIMIT = 100; // API max for /vps and /shared-hosting
const DOMAIN_PAGE_LIMIT = 1000; // API max for /domains
const PAID_PERIOD_BATCH = 100; // /vps/paid-periods accepts 1-100 ids per call

/** A HostUp API failure that keeps the HTTP status, so optional sections can skip a 403. */
export class HostupApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = 'HostupApiError';
  }
}

// HostUp public API v2 (https://cloud.hostup.se/api/v2, docs https://developer.hostup.se):
// no npm SDK -> thin axios client, `Authorization: Bearer <API key>`; keys are scoped
// (read:billing, read:services, read:vm, read:domains — or read:all). 250 req/min per account.
// Balance: GET /billing/account (`creditBalance`, prepaid credit in the account currency).
// Services: /vps (+ /vps/paid-periods for the next charge date), /shared-hosting, /domains.
// Payments: /billing/activity?kind=transaction — settled real-money payments -> topup.
export class HostupConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly logger = new Logger(HostupConnector.name);

  constructor(token: string) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
    });
    // Errors are RFC 7807 Problem Details: surface `detail`/`title` plus the stable `code`
    // (e.g. a key missing a scope) instead of axios' bare "Request failed with status code 403".
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e) && e.response) {
        const body = e.response.data as HostupProblem | undefined;
        const text = body?.detail || body?.title;
        const code = body?.code;
        if (text || code) {
          throw new HostupApiError(
            `HostUp: ${text ?? 'request failed'}${code ? ` (${code})` : ''}`,
            e.response.status,
            code,
          );
        }
        throw new HostupApiError(e.message, e.response.status, undefined);
      }
      throw e;
    });
  }

  kind(): string {
    return 'hostup';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<HostupBillingAccount>('/billing/account', { signal });
    if (!data || data.creditBalance === undefined) {
      throw new Error('HostUp: unexpected /billing/account response (no `creditBalance`)');
    }
    return {
      balance: toDecimal(data.creditBalance),
      currency: normalizeCurrency(data.currencyCode, HOSTUP_FALLBACK_CURRENCY),
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    // VPS are the core inventory and need the key's read:vm + read:services; hosting accounts and
    // domains are optional extras a narrower key may not cover (403 -> section skipped).
    const [vps, hosting, domains] = await Promise.all([
      this.paginate<HostupVps>('/vps', VPS_PAGE_LIMIT, signal),
      this.optional('shared hosting', () =>
        this.paginate<HostupSharedHosting>('/shared-hosting', VPS_PAGE_LIMIT, signal),
      ),
      this.optional('domains', () =>
        this.paginate<HostupDomain>('/domains', DOMAIN_PAGE_LIMIT, signal),
      ),
    ]);

    const liveVps = vps.filter(isLiveHostupService);
    const paidPeriods = await this.fetchPaidPeriods(
      liveVps.filter((v) => !v.paidPeriod && v.billing.isPayg !== true).map((v) => v.id),
      signal,
    );

    return [
      ...liveVps.map((v) => mapHostupVps(v, paidPeriods.get(v.id))),
      ...hosting.filter(isLiveHostupService).map(mapHostupSharedHosting),
      ...domains.filter(isLiveHostupService).map(mapHostupDomain),
    ];
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const byId = new Map<string, PaymentData>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await this.http.get<HostupTransactionActivity>('/billing/activity', {
        params: { kind: 'transaction', page },
        signal,
      });
      for (const entry of data?.entries ?? []) {
        const payment = mapHostupTransaction(entry);
        // Pages can shift while we walk them (a new payment lands on page 0) — dedupe by id.
        if (payment) byId.set(payment.externalId, payment);
      }
      if (!data?.hasMore || !data.entries?.length) break;
    }
    return [...byId.values()];
  }

  /**
   * Paid periods for VPS whose list row came without one (the field is only inlined when HostUp
   * enables paid-period presentation). Best-effort: without it the next billing date stays as
   * stored rather than failing the sync.
   */
  private async fetchPaidPeriods(
    ids: string[],
    signal: AbortSignal,
  ): Promise<Map<string, HostupPaidPeriod>> {
    const out = new Map<string, HostupPaidPeriod>();
    for (let i = 0; i < ids.length; i += PAID_PERIOD_BATCH) {
      const batch = ids.slice(i, i + PAID_PERIOD_BATCH);
      try {
        const { data } = await this.http.get<HostupPaidPeriodsResponse>('/vps/paid-periods', {
          params: { ids: batch.join(',') },
          signal,
        });
        for (const r of data?.results ?? []) out.set(r.vpsId, r.paidPeriod);
      } catch (e) {
        if (signal.aborted) throw e;
        this.logger.warn(
          `HostUp paid periods unavailable, next billing dates left as stored: ${errorText(e)}`,
        );
        break;
      }
    }
    return out;
  }

  /** Run an optional section; a 403 (key without that scope) yields [] instead of failing. */
  private async optional<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HostupApiError && e.status === 403) {
        this.logger.warn(`HostUp ${label} skipped (API key lacks the scope): ${e.message}`);
        return [];
      }
      throw e;
    }
  }

  /** Walk cursor pages (`hasMore` + `nextCursor`), accumulating `data` rows. */
  private async paginate<T>(path: string, limit: number, signal: AbortSignal): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data }: { data: HostupPage<T> } = await this.http.get<HostupPage<T>>(path, {
        params: { limit, ...(cursor ? { cursor } : {}) },
        signal,
      });
      out.push(...(data?.data ?? []));
      cursor = data?.hasMore ? data.nextCursor : null;
      if (!cursor) break;
    }
    return out;
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
