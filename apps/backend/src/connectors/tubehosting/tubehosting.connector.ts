import axios, { type AxiosInstance } from 'axios';
import type { z } from 'zod';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { totpCode } from '../common/totp';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  fromCents,
  isLiveTubeHostingGroup,
  mapTubeHostingEntry,
  mapTubeHostingGroup,
  TUBEHOSTING_CURRENCY,
} from './tubehosting.mapper';
import {
  TubeHostingCredentials,
  tubeHostingLoginSchema,
  tubeHostingMeSchema,
  tubeHostingPaymentsPageSchema,
  tubeHostingServiceGroupSchema,
  tubeHostingTokensSchema,
} from './tubehosting.types';

const BASE_URL = 'https://api.tube-hosting.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety cap so a broken pagination contract can't loop forever

const TWO_FACTOR_MESSAGE =
  'Tube-Hosting: authenticator-app (TOTP) 2FA is enabled but no TOTP secret is set. Add the base32 ' +
  'TOTP secret in the provider settings so the sync can generate the one-time code itself.';

type Tokens = z.infer<typeof tubeHostingTokensSchema>;

/**
 * Tube-Hosting panel API (https://api.tube-hosting.com — the JSON API behind cp.tube-hosting.com;
 * no public API keys). Login is email + password (`POST /login`); with a confirmed TOTP device the
 * session is then confirmed via `POST /confirmSession`. Access tokens live ~2 minutes, so a 401
 * refreshes the session (`POST /refreshSession`) and, failing that, logs in again.
 */
export class TubeHostingConnector implements Connector {
  private readonly http: AxiosInstance;
  private tokens: Tokens | null = null;

  constructor(private readonly creds: TubeHostingCredentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      // Statuses are handled by the callers; only network errors throw.
      validateStatus: () => true,
    });
  }

  kind(): string {
    return 'tubehosting';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const me = tubeHostingMeSchema.safeParse(await this.get('/me', signal));
    if (!me.success) throw new Error('Tube-Hosting: invalid account response');
    return { balance: fromCents(me.data.balance), currency: TUBEHOSTING_CURRENCY };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const raw = await this.get('/servicegroups/currents', signal, { primaryOnly: false });
    const groups = tubeHostingServiceGroupSchema.array().safeParse(raw);
    if (!groups.success) throw new Error('Tube-Hosting: invalid service list response');
    return groups.data.filter(isLiveTubeHostingGroup).map(mapTubeHostingGroup);
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const out: PaymentData[] = [];
    let seen = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const raw = await this.get('/payments', signal, { page, size: PAGE_SIZE });
      const parsed = tubeHostingPaymentsPageSchema.safeParse(raw);
      if (!parsed.success) throw new Error('Tube-Hosting: invalid payments response');
      const { count, items } = parsed.data;
      for (const entry of items) out.push(...mapTubeHostingEntry(entry));
      seen += items.length;
      if (seen >= count || items.length === 0) return out;
    }
    throw new Error('Tube-Hosting: payments pagination limit exceeded');
  }

  /** Authenticated GET; one 401 renews the session and retries. */
  private async get(
    path: string,
    signal: AbortSignal,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const tokens = await this.session(signal, attempt > 0);
      const res = await this.send('get', path, undefined, signal, params, tokens.accessToken);
      if (res.status === 401 && attempt === 0) continue;
      if (res.status >= 400) throw apiError(`GET ${path}`, res.status, res.data);
      return res.data;
    }
    throw new Error('Tube-Hosting: session renewal failed');
  }

  private async session(signal: AbortSignal, renew: boolean): Promise<Tokens> {
    if (this.tokens && !renew) return this.tokens;
    if (this.tokens && renew) {
      const res = await this.send(
        'post',
        '/refreshSession',
        {
          refreshToken: this.tokens.refreshToken,
        },
        signal,
      );
      const refreshed = tubeHostingTokensSchema.safeParse(res.data);
      if (res.status < 400 && refreshed.success) {
        this.tokens = refreshed.data;
        return this.tokens;
      }
    }
    this.tokens = await this.login(signal);
    return this.tokens;
  }

  private async login(signal: AbortSignal): Promise<Tokens> {
    const res = await this.send(
      'post',
      '/login',
      {
        mail: this.creds.username,
        password: this.creds.password,
        token: null,
      },
      signal,
    );
    if (res.status >= 400) throw apiError('login', res.status, res.data);
    const login = tubeHostingLoginSchema.safeParse(res.data);
    if (!login.success) throw new Error('Tube-Hosting: invalid login response');

    // Unconfirmed devices (setup started, never finished) don't gate the login.
    const devices = (login.data.userData.twoFADevices ?? []).filter(
      (d) => d.confirmed && d.type === 'TOTP',
    );
    // Keep only the tokens: userData carries personal account details.
    const { accessToken, refreshToken } = login.data;
    if (!devices.length) return { accessToken, refreshToken };
    if (!this.creds.totpSecret) throw new Error(TWO_FACTOR_MESSAGE);

    // The secret belongs to one of the confirmed devices; the API doesn't say which.
    let lastStatus = 0;
    for (const device of devices) {
      const confirm = await this.send(
        'post',
        '/confirmSession',
        {
          refreshToken,
          data: {
            deviceId: device.id,
            code: totpCode(this.creds.totpSecret, Date.now()),
            type: 'TOTP',
          },
        },
        signal,
      );
      const tokens = tubeHostingTokensSchema.safeParse(confirm.data);
      if (confirm.status < 400 && tokens.success) return tokens.data;
      lastStatus = confirm.status;
    }
    throw new Error(`Tube-Hosting: TOTP code rejected (HTTP ${lastStatus})`);
  }

  private async send(
    method: 'get' | 'post',
    path: string,
    body: unknown,
    signal: AbortSignal,
    params?: Record<string, unknown>,
    accessToken?: string,
  ) {
    try {
      return await this.http.request({
        method,
        url: path,
        data: body,
        params,
        signal,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      // Axios errors carry the request body (password) and headers: never pass them to logs.
      const code = axios.isAxiosError(error) && error.code ? ` (${error.code})` : '';
      throw new Error(`Tube-Hosting: request to ${path} failed${code}`);
    }
  }
}

function apiError(operation: string, status: number, data: unknown): Error {
  const message = (data as { message?: unknown } | null)?.message;
  const detail = typeof message === 'string' && message.trim() ? `: ${message.trim()}` : '';
  return new Error(`Tube-Hosting: ${operation} failed (HTTP ${status})${detail}`);
}
