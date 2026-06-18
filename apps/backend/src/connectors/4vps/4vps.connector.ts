import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, ServiceData } from '../connector.interface';
import { mapFourVpsServer } from './4vps.mapper';
import { ApiResponse, Datacenter, FourVpsCredentials, FourVpsServer } from './4vps.types';

const BASE_URL = 'https://4vps.su/api';
const DEFAULT_PANEL_ID = '1';

/**
 * 4VPS.SU connector (https://4vps.su/page/api). No npm SDK, so a thin axios client.
 * Auth: `Authorization: Bearer <API_KEY>` plus a required `panel_id` query param (which billing
 * panel the key belongs to; defaults to 1). Responses are wrapped in `{ error, data }`. Balance is
 * in RUB (`/userBalance`); servers come from `/myservers` (monthly RUB price, unix `expired` =
 * next charge), with the country resolved from `/getDcList` flags. No payment-history endpoint.
 */
export class FourVpsConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(creds: FourVpsCredentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${creds.token}` },
      params: { panel_id: creds.panelId || DEFAULT_PANEL_ID },
    });
    // Surface auth/param failures clearly (a wrong token or panel_id → 4xx).
    this.http.interceptors.response.use(undefined, (e) => {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 400 || status === 401 || status === 403) {
        throw new Error(`4VPS: invalid API token or panel_id (HTTP ${status})`);
      }
      throw e;
    });
  }

  kind(): string {
    return '4vps';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<ApiResponse<{ userBalance: number }>>('/userBalance', {
      signal,
    });
    assertOk(data);
    return { balance: new Decimal(data.data?.userBalance ?? 0), currency: 'RUB' };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const [serversRes, dcFlags] = await Promise.all([
      this.http.get<ApiResponse<{ serverlist: FourVpsServer[] }>>('/myservers', { signal }),
      this.fetchDcFlags(signal),
    ]);
    assertOk(serversRes.data);
    return (serversRes.data.data?.serverlist ?? [])
      .filter((s) => !s.deleted)
      .map((s) => mapFourVpsServer(s, dcFlags));
  }

  /** datacenter id → ISO2 flag (best-effort; empty map on failure → country left unset). */
  private async fetchDcFlags(signal: AbortSignal): Promise<Map<number, string>> {
    try {
      const { data } = await this.http.get<ApiResponse<{ dcList: Record<string, Datacenter> }>>(
        '/getDcList',
        { signal },
      );
      const map = new Map<number, string>();
      for (const dc of Object.values(data.data?.dcList ?? {})) {
        if (dc.id != null && dc.flag) map.set(dc.id, dc.flag);
      }
      return map;
    } catch {
      return new Map();
    }
  }
}

/** 4VPS returns 200 with `{ error: true, data: <message> }` on logical failures. */
function assertOk(res: ApiResponse<unknown>): void {
  if (res?.error) {
    const msg = typeof res.data === 'string' ? res.data : 'request rejected';
    throw new Error(`4VPS: ${msg}`);
  }
}
