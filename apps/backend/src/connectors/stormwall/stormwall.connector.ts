import axios, { type AxiosInstance } from 'axios';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, ServiceData } from '../connector.interface';
import { STORMWALL_CURRENCY, mapStormwallService } from './stormwall.mapper';
import {
  StormwallDomain,
  StormwallEnvelope,
  StormwallPaged,
  StormwallService,
} from './stormwall.types';

const BASE_URL = 'https://api.stormwall.pro';
const PAGE_LIMIT = 100; // documented default is 10; requesting more to cut round-trips
const MAX_PAGES = 50; // safety cap against a misbehaving pagination contract

/**
 * StormWall (DDoS-protection/WAF) connector, verified against the live OpenAPI spec
 * (https://api.stormwall.pro/v3/api/swagger.json — that path only hosts the spec file itself;
 * actual requests go to the domain root, e.g. `GET https://api.stormwall.pro/v3/services`, since
 * the spec's `paths` already include the `v3` segment). Auth: `x-api-key` header (single string,
 * like timeweb/netlen/vultr/linode/aeza). No npm SDK → thin axios client.
 *
 * There is NO billing data anywhere in the API (no balance/invoice/payment/price/currency/tariff
 * field in the whole spec) → `fetchAccount` returns `balance: null` (like Hetzner/netcup) and
 * there is no `fetchPayments`. Services have no cost/currency/period either → left for manual
 * entry. The only useful endpoint is `GET /v3/services`; for `type: 'domain'` items we additionally
 * call `GET /v3/domains?serviceId=` to use the actual protected domain name.
 */
export class StormwallConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'x-api-key': token },
    });
    // No error-response schema is documented beyond HTTP status codes (400/403/404/500+); live
    // errors are `{ status: "error", payload: { statusCode, code, message } }` (verified against
    // a real 401) — best-effort extraction of a readable message, falling back to the bare status.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as Record<string, unknown> | undefined;
        const msg = extractMessage(body);
        throw new Error(
          msg ? `StormWall: ${msg}` : `StormWall API error (HTTP ${e.response?.status})`,
        );
      }
      throw e;
    });
  }

  kind(): string {
    return 'stormwall';
  }

  // StormWall has no billing endpoint anywhere in the API (verified against the full spec).
  async fetchAccount(): Promise<Account> {
    return { balance: null, currency: STORMWALL_CURRENCY };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const services = await this.paginate<StormwallService>('/v3/services', undefined, signal);
    return Promise.all(services.map((s) => this.mapWithName(s, signal)));
  }

  /** For `type: 'domain'` items, enrich the name with the actual protected domain(s); best-effort. */
  private async mapWithName(s: StormwallService, signal: AbortSignal): Promise<ServiceData> {
    if (s.type !== 'domain') return mapStormwallService(s);
    try {
      const domains = await this.paginate<StormwallDomain>(
        '/v3/domains',
        { serviceId: s.serviceId },
        signal,
      );
      const name = domains
        .map((d) => d.domain)
        .filter(Boolean)
        .join(', ');
      return mapStormwallService(s, name || undefined);
    } catch {
      return mapStormwallService(s);
    }
  }

  /** Walk `{ status, payload: { total, limit, offset, results } }`, advancing by the actual page size. */
  private async paginate<T>(
    path: string,
    extraParams: Record<string, unknown> | undefined,
    signal: AbortSignal,
  ): Promise<T[]> {
    const out: T[] = [];
    let offset = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const { data } = await this.http.get<StormwallEnvelope<StormwallPaged<T>>>(path, {
        params: { limit: PAGE_LIMIT, offset, ...extraParams },
        signal,
      });
      const results = data.payload?.results ?? [];
      out.push(...results);
      if (results.length === 0) break; // guard against a stuck/incorrect `total`
      offset += results.length;
      if (offset >= (data.payload?.total ?? offset)) break;
    }
    return out;
  }
}

function extractMessage(body: Record<string, unknown> | undefined): string | undefined {
  if (!body) return undefined;
  // Live shape: { status: "error", payload: { statusCode, code, message } }.
  const payload = body.payload as Record<string, unknown> | undefined;
  if (payload) {
    if (typeof payload.message === 'string' && payload.message) return payload.message;
    if (typeof payload.code === 'string' && payload.code) return payload.code;
  }
  if (typeof body.message === 'string' && body.message) return body.message;
  if (typeof body.error === 'string' && body.error) return body.error;
  if (Array.isArray(body.errors)) {
    const joined = body.errors.filter((e) => typeof e === 'string').join('; ');
    if (joined) return joined;
  }
  return undefined;
}
