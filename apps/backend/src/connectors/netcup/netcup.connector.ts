import axios, { type AxiosInstance } from 'axios';
import { createHttp, REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, ServiceData } from '../connector.interface';
import { NETCUP_CLIENT_ID, NETCUP_TOKEN_URL } from './netcup.device-flow';
import { mapNetcupServer } from './netcup.mapper';
import { NetcupServer, TokenResponse } from './netcup.types';

const API_BASE_URL = 'https://www.servercontrolpanel.de/scp-core/api/v1';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

/**
 * netcup Server Control Panel connector, the new REST API
 * (https://www.netcup.com/en/helpcenter/documentation/server/rest-api), which replaced
 * the legacy SOAP web service in Oct 2025. No npm SDK, so a thin axios client.
 *
 * Auth: OAuth2 (Keycloak realm `scp`). The API has no static API key. The owner runs the
 * device-code flow once (in a browser, passing any 2FA there) and pastes the resulting
 * offline refresh token; we exchange it for a short-lived access token each sync via
 * `grant_type=refresh_token`.
 *
 * The REST API is server-management only: there is NO billing/balance/invoice endpoint, so
 * `fetchAccount` returns `balance: null` (like Hetzner) and there is no `fetchPayments`.
 * Server price is not exposed either → `cost` is left for manual entry. netcup bills in EUR.
 */
export class NetcupConnector implements Connector {
  private readonly http: AxiosInstance;
  private accessToken: string | null = null;

  constructor(private readonly refreshToken: string) {
    this.http = createHttp({ baseURL: API_BASE_URL, timeout: REQUEST_TIMEOUT_MS });
  }

  kind(): string {
    return 'netcup';
  }

  // netcup's REST API has no account balance endpoint; it bills in EUR.
  async fetchAccount(_signal: AbortSignal): Promise<Account> {
    return { balance: null, currency: 'EUR' };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const token = await this.ensureAccessToken(signal);
    const auth = { Authorization: `Bearer ${token}` };
    const list = await this.fetchServerList(auth, signal);
    // `GET /servers` is minimal (no location/specs); enrich each from the detail endpoint
    // (`site.city` → country, plus IPs/CPU/RAM into meta). Best-effort and per-server.
    return Promise.all(list.map((s) => this.mapWithDetail(s, auth, signal)));
  }

  /** Paginated minimal server list. */
  private async fetchServerList(
    auth: Record<string, string>,
    signal: AbortSignal,
  ): Promise<NetcupServer[]> {
    const out: NetcupServer[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await this.http.get<unknown>('/servers', {
        params: { limit: PAGE_LIMIT, offset: page * PAGE_LIMIT },
        headers: auth,
        signal,
      });
      const batch = asArray(data);
      out.push(...batch);
      if (batch.length < PAGE_LIMIT) break;
    }
    return out;
  }

  /** Fetch a server's full detail (location/specs) and map it; fall back to the list entry. */
  private async mapWithDetail(
    s: NetcupServer,
    auth: Record<string, string>,
    signal: AbortSignal,
  ): Promise<ServiceData> {
    if (s.id == null) return mapNetcupServer(s);
    try {
      const { data } = await this.http.get<NetcupServer>(`/servers/${s.id}`, {
        params: { loadServerLiveInfo: true },
        headers: auth,
        signal,
      });
      return mapNetcupServer(data ?? s);
    } catch {
      return mapNetcupServer(s);
    }
  }

  /** Mint an access token from the stored offline refresh token (cached per sync). */
  private async ensureAccessToken(signal: AbortSignal): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: NETCUP_CLIENT_ID,
      refresh_token: this.refreshToken,
    });
    try {
      const { data } = await axios.post<TokenResponse>(NETCUP_TOKEN_URL, body, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal,
      });
      if (!data?.access_token) throw new Error('no access_token in token response');
      this.accessToken = data.access_token;
      return this.accessToken;
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 400 || status === 401) {
        throw new Error(
          'netcup: invalid or expired refresh token — re-authorize via the SCP device flow',
        );
      }
      throw e;
    }
  }
}

/** `GET /servers` returns a bare array; tolerate a wrapped `{ data|servers|items: [] }` too. */
function asArray(data: unknown): NetcupServer[] {
  if (Array.isArray(data)) return data as NetcupServer[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['data', 'servers', 'items', 'content']) {
      if (Array.isArray(obj[key])) return obj[key] as NetcupServer[];
    }
  }
  return [];
}
