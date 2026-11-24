import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { createHttp, REQUEST_TIMEOUT_MS } from '../common/http';
import { totpCode } from '../common/totp';
import { Account, Connector, ServiceData } from '../connector.interface';
import { BEGET_CURRENCY, mapBegetCloudService, mapBegetVps } from './beget.mapper';
import {
  BegetAuthResponse,
  BegetCloudListResponse,
  BegetCredentials,
  BegetLegacyAccountInfo,
  BegetRegionListResponse,
  BegetVpsListResponse,
} from './beget.types';

const BASE_URL = 'https://api.beget.com';

const TWO_FACTOR_MESSAGE =
  'Beget: authenticator-app (TOTP) 2FA is enabled but no TOTP secret is set. Add the base32 TOTP ' +
  'secret in the provider settings so the sync can generate the one-time code itself.';

/**
 * Beget connector, verified live. TWO APIs on api.beget.com:
 *  - new Cloud API (/v1/*): JWT auth, POST /v1/auth, ACCOUNT login+password → { token }, then
 *    `Authorization: Bearer <jwt>` (mixed-case "Bearer"; "BEARER" 500s). Lists VPS
 *    (/v1/vps/server/list) and cloud services (/v1/cloud: DB/S3/CDN/Network Drive), RUB. No balance,
 *    no next-billing date.
 *  - legacy hosting API (/api/user/getAccountInfo): login + the separate panel "API password" →
 *    balance (user_balance, RUB). Optional.
 * No npm SDK (official openapi-auth-* generators aren't on npm) → thin axios client. 2FA: on
 * CODE_REQUIRED_TOTP we confirm with a generated code (needs the base32 secret); SMS/email can't.
 */
export class BegetConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly creds: BegetCredentials;
  private token: string | null = null;

  constructor(creds: BegetCredentials) {
    this.creds = creds;
    this.http = createHttp({ baseURL: BASE_URL, timeout: REQUEST_TIMEOUT_MS });
    // New-API errors carry the reason in the `x-error-result` header with an empty body. Surface it.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const xer = e.response?.headers?.['x-error-result'];
        if (xer) throw new Error(`Beget API: ${xer} (HTTP ${e.response?.status})`);
      }
      throw e;
    });
  }

  kind(): string {
    return 'beget';
  }

  /** Exchange the account login+password (+ generated TOTP code if 2FA) for a JWT; cached per sync. */
  private async authToken(signal: AbortSignal): Promise<string> {
    if (this.token) return this.token;
    let res = await this.login(undefined, signal);
    if (!res.token && isTotpRequired(res.error)) {
      if (!this.creds.totpSecret) throw new Error(TWO_FACTOR_MESSAGE);
      res = await this.login(totpCode(this.creds.totpSecret, Date.now()), signal);
    }
    if (!res.token) throw new Error(authErrorMessage(res.error));
    this.token = res.token;
    return res.token;
  }

  private async login(code: string | undefined, signal: AbortSignal): Promise<BegetAuthResponse> {
    // /v1/auth replies HTTP 200 even on failure: { token } on success, { error } otherwise.
    const body: Record<string, string> = {
      login: this.creds.username,
      password: this.creds.password,
    };
    if (code) body.code = code;
    const { data } = await this.http.post<BegetAuthResponse>('/v1/auth', body, { signal });
    return data ?? {};
  }

  /**
   * Balance via the legacy hosting API (the new Cloud API has none). Needs the separate panel
   * "API password"; without it we report no balance (like Hetzner) and services still sync.
   */
  async fetchAccount(signal: AbortSignal): Promise<Account> {
    if (!this.creds.apiPassword) return { balance: null, currency: BEGET_CURRENCY };
    const { data } = await this.http.get<BegetLegacyAccountInfo>('/api/user/getAccountInfo', {
      params: { login: this.creds.username, passwd: this.creds.apiPassword, output_format: 'json' },
      signal,
    });
    // The legacy API returns HTTP 200 even on error ({ status:'error', error_text }).
    if (data?.status !== 'success' || data?.answer?.status !== 'success') {
      const reason = data?.error_text || data?.error_code || 'legacy API rejected the request';
      throw new Error(`Beget (balance): ${reason}`);
    }
    const balance = data?.answer?.result?.user_balance;
    return {
      balance: balance != null ? new Decimal(balance) : null,
      currency: BEGET_CURRENCY,
    };
  }

  /** VPS (/v1/vps/server/list) + managed cloud services (/v1/cloud), combined. */
  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const token = await this.authToken(signal);
    const headers = { Authorization: `Bearer ${token}` };
    // Both lists are required: if one fails we throw, so the sync won't wrongly deactivate the
    // other product's services (the sync deactivates managed services missing from the result).
    const [regions, vps, cloud] = await Promise.all([
      this.fetchRegions(headers, signal),
      this.http.get<BegetVpsListResponse>('/v1/vps/server/list', { headers, signal }),
      this.http.get<BegetCloudListResponse>('/v1/cloud', { headers, signal }),
    ]);
    const out: ServiceData[] = [];
    for (const v of vps.data?.vps ?? []) out.push(mapBegetVps(v, regions));
    for (const s of cloud.data?.service ?? []) out.push(mapBegetCloudService(s, regions));
    return out;
  }

  /** Region id → ISO2 country (best-effort; the mapper falls back to the region prefix). */
  private async fetchRegions(
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Map<string, string>> {
    try {
      const { data } = await this.http.get<BegetRegionListResponse>('/v1/vps/region', {
        headers,
        signal,
      });
      const map = new Map<string, string>();
      for (const r of data?.regions ?? []) if (r.id && r.country) map.set(r.id, r.country);
      return map;
    } catch {
      // Region names are best-effort; without them the mapper derives country from the region id.
      return new Map();
    }
  }
}

function isTotpRequired(error?: string): boolean {
  return error === 'CODE_REQUIRED_TOTP' || error === 'CODE_REQUIRED';
}

function authErrorMessage(error?: string): string {
  switch (error) {
    case 'INCORRECT_CREDENTIALS':
      return 'Beget: invalid account login or password.';
    case 'INCORRECT_CODE':
      return 'Beget: the 2FA code was rejected — check the TOTP secret and the server clock.';
    case 'CODE_REQUIRED_EMAIL':
    case 'CODE_REQUIRED_SMS':
      return 'Beget: SMS/email 2FA cannot be automated — switch to an authenticator app (TOTP) or disable 2FA.';
    case 'IP_BLOCKED':
      return 'Beget: API authentication from this IP is blocked (check IP restrictions in the panel).';
    case 'EXPIRED_PASSWORD':
      return 'Beget: the account password has expired — update it in the Beget panel.';
    default:
      return `Beget: authentication failed (${error ?? 'unknown error'}).`;
  }
}
