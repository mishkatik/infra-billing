import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { normalizeCurrency } from '../common/currency';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { mapNodehostBillingEntry, mapNodehostServer, NODEHOST_CURRENCY } from './nodehost.mapper';
import {
  NodehostServer,
  nodehostBillingEntrySchema,
  nodehostBillingSchema,
  nodehostErrorSchema,
  nodehostLocationsSchema,
  nodehostServersPageSchema,
  nodehostUsageSchema,
} from './nodehost.types';

const BASE_URL = 'https://nodehost.cc/api/v1';
const PAGE_LIMIT = 100; // API max for /servers
const MAX_PAGES = 100; // safety cap so a broken cursor contract can't loop forever
const BILLING_LIMIT = 500; // API max for /billing; the feed has no pagination

// NodeHost Developer API v1 (https://nodehost.cc/api/v1/docs): no SDK -> thin axios client,
// `Authorization: Bearer <nh_live_… key>`. A read-only key (scopes account:read + servers:read)
// is enough. Only servers created through the API are visible; servers bought on the website
// are not. Balance and currency: GET /usage. Services: GET /servers (cursor pagination).
// Payments: GET /billing (top-ups and server charges).
export class NodehostConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
    });
    // Surface the API's own message instead of axios' error, which carries the request headers
    // (the API key) and would end up in the sync logs.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = nodehostErrorSchema.safeParse(e.response?.data);
        const status = e.response?.status;
        const reason = body.success
          ? [body.data.error.message, body.data.error.code && `(${body.data.error.code})`]
              .filter(Boolean)
              .join(' ')
          : e.code;
        throw new Error(
          `NodeHost: ${reason || 'request failed'}${status ? ` [HTTP ${status}]` : ''}`,
        );
      }
      throw e;
    });
  }

  kind(): string {
    return 'nodehost';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get('/usage', { signal });
    const parsed = nodehostUsageSchema.safeParse(data);
    if (!parsed.success) throw new Error('NodeHost: unexpected /usage response');
    return {
      balance: new Decimal(parsed.data.balance),
      currency: normalizeCurrency(parsed.data.currency ?? undefined, NODEHOST_CURRENCY),
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    // The list is the inventory: a failure here must fail the sync, so nothing is marked inactive.
    const [servers, countries] = await Promise.all([
      this.fetchAllServers(signal),
      this.fetchCountries(signal),
    ]);
    return servers.map((s) => mapNodehostServer(s, countries, NODEHOST_CURRENCY));
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const { data } = await this.http.get('/billing', { params: { limit: BILLING_LIMIT }, signal });
    const parsed = nodehostBillingSchema.safeParse(data);
    if (!parsed.success) throw new Error('NodeHost: unexpected /billing response');
    const byId = new Map<string, PaymentData>();
    for (const row of parsed.data.data) {
      // Unknown entry types are skipped rather than failing the whole import.
      const entry = nodehostBillingEntrySchema.safeParse(row);
      if (!entry.success) continue;
      const payment = mapNodehostBillingEntry(entry.data);
      if (payment) byId.set(payment.externalId, payment);
    }
    return [...byId.values()];
  }

  /** Walk cursor pages (`nextCursor`, null on the last one). */
  private async fetchAllServers(signal: AbortSignal): Promise<NodehostServer[]> {
    const byId = new Map<string, NodehostServer>();
    let cursor: string | null | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await this.http.get('/servers', {
        params: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
        signal,
      });
      const parsed = nodehostServersPageSchema.safeParse(data);
      if (!parsed.success) throw new Error('NodeHost: unexpected /servers response');
      for (const s of parsed.data.data) byId.set(s.id, s);
      const next = parsed.data.nextCursor;
      if (!next) return [...byId.values()];
      if (next === cursor) throw new Error('NodeHost: /servers cursor did not advance');
      cursor = next;
    }
    throw new Error('NodeHost: /servers pagination limit exceeded');
  }

  /** Localized location name (lower case) -> ISO country code. Best-effort: empty map on failure. */
  private async fetchCountries(signal: AbortSignal): Promise<Map<string, string>> {
    try {
      const { data } = await this.http.get('/catalog/locations', { signal });
      const parsed = nodehostLocationsSchema.safeParse(data);
      const map = new Map<string, string>();
      if (parsed.success) {
        for (const l of parsed.data) map.set(l.name.toLowerCase(), l.code.toUpperCase());
      }
      return map;
    } catch (e) {
      if (signal.aborted) throw e;
      return new Map();
    }
  }
}
