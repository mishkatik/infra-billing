import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { totpCode } from '../common/totp';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  DOUBLESERVERS_CURRENCY,
  mapDoubleServersCharge,
  mapDoubleServersServer,
  mapDoubleServersTopup,
} from './doubleservers.mapper';
import {
  DoubleServersCredentials,
  DoubleServersLoginResponse,
  DoubleServersMe,
  DoubleServersPage,
  DoubleServersServer,
  DoubleServersServerHistoryItem,
  DoubleServersTopup,
} from './doubleservers.types';

const BASE_URL = 'https://doubleservers.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

const TWO_FACTOR_MESSAGE =
  'Double Servers: authenticator-app (TOTP) 2FA is enabled but no TOTP secret is set. Add the base32 TOTP ' +
  'secret in the provider settings so the sync can generate the one-time code itself.';

export class DoubleServersConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly creds: DoubleServersCredentials;
  private token: string | null = null;

  constructor(creds: DoubleServersCredentials) {
    this.creds = creds;
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as { detail?: unknown } | undefined;
        const detail = formatDetail(body?.detail);
        if (detail) throw new Error(`Double Servers: ${detail}`);
      }
      throw e;
    });
  }

  kind(): string {
    return 'doubleservers';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const me = await this.getMe(signal);
    return {
      balance: new Decimal(String(me.balance ?? 0)),
      currency: DOUBLESERVERS_CURRENCY,
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const { data } = await this.request<DoubleServersServer[]>('/api/servers', signal);
    return (data ?? []).map(mapDoubleServersServer);
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const [topups, serversRes] = await Promise.all([
      this.paginateTopups(signal),
      this.request<DoubleServersServer[]>('/api/servers', signal),
    ]);
    const servers = serversRes.data ?? [];
    const out: PaymentData[] = [];
    for (const t of topups) {
      const mapped = mapDoubleServersTopup(t);
      if (mapped) out.push(mapped);
    }
    const histories = await Promise.all(
      servers.map((s) => this.paginateServerHistory(s.id, signal).then((items) => ({ s, items }))),
    );
    for (const { s, items } of histories) {
      for (const item of items) {
        const mapped = mapDoubleServersCharge(item, s.id);
        if (mapped) out.push(mapped);
      }
    }
    return out;
  }

  private async getMe(signal: AbortSignal): Promise<DoubleServersMe> {
    const { data } = await this.request<DoubleServersMe>('/api/auth/me', signal);
    return data;
  }

  private async authToken(signal: AbortSignal): Promise<string> {
    if (this.token) return this.token;
    let res = await this.login(undefined, signal);
    if (res.totp_required) {
      if (!this.creds.totpSecret) throw new Error(TWO_FACTOR_MESSAGE);
      res = await this.login(totpCode(this.creds.totpSecret, Date.now()), signal);
    }
    if (!this.token) {
      throw new Error(loginErrorMessage(res));
    }
    return this.token;
  }

  private async login(
    totp: string | undefined,
    signal: AbortSignal,
  ): Promise<DoubleServersLoginResponse> {
    const body: Record<string, string> = {
      email: this.creds.username,
      password: this.creds.password,
    };
    if (totp) body.totp_code = totp;
    const res = await this.http.post<DoubleServersLoginResponse>('/api/auth/email/login', body, {
      signal,
      validateStatus: (s) => s < 500,
    });
    const data = res.data ?? {};
    if (res.status >= 400) throw new Error(loginErrorMessage(data));
    if (data.totp_required) return data;
    const token = extractAccessToken(res.headers['set-cookie']);
    if (!token) throw new Error('Double Servers: login succeeded but no access_token cookie was set');
    this.token = token;
    return data;
  }

  private async request<T>(path: string, signal: AbortSignal, params?: Record<string, unknown>) {
    const token = await this.authToken(signal);
    return this.http.get<T>(path, {
      headers: { Authorization: `Bearer ${token}` },
      params,
      signal,
    });
  }

  private async paginateTopups(signal: AbortSignal): Promise<DoubleServersTopup[]> {
    return this.paginate<DoubleServersTopup>('/api/billing/history', signal);
  }

  private async paginateServerHistory(
    serverId: number,
    signal: AbortSignal,
  ): Promise<DoubleServersServerHistoryItem[]> {
    return this.paginate<DoubleServersServerHistoryItem>(
      `/api/servers/${serverId}/history`,
      signal,
    );
  }

  private async paginate<T>(path: string, signal: AbortSignal): Promise<T[]> {
    const out: T[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await this.request<DoubleServersPage<T>>(path, signal, {
        page,
        per_page: PAGE_SIZE,
      });
      const items = data.items ?? [];
      out.push(...items);
      const totalPages = data.total_pages ?? 1;
      if (page + 1 >= totalPages || items.length === 0) break;
    }
    return out;
  }
}

function extractAccessToken(setCookie: string[] | string | undefined): string | null {
  const parts = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const raw of parts) {
    const m = /(?:^|,\s*)access_token=([^;]+)/.exec(raw);
    if (m?.[1]) return m[1];
  }
  return null;
}

function formatDetail(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === 'string' ? d : (d as { msg?: string })?.msg))
      .filter((m): m is string => !!m);
    if (msgs.length) return msgs.join('; ');
  }
  return null;
}

function loginErrorMessage(res: DoubleServersLoginResponse): string {
  const detail = formatDetail(res.detail);
  if (detail) return `Double Servers: ${detail}`;
  if (res.totp_required) return TWO_FACTOR_MESSAGE;
  return 'Double Servers: login failed';
}
