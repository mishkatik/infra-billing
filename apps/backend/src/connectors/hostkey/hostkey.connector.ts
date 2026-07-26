import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, ServiceData } from '../connector.interface';
import { mapHostkeyServer } from './hostkey.mapper';
import {
  HostkeyCreditEntry,
  HostkeyCreditsResponse,
  HostkeyListResponse,
  HostkeyLoginPayload,
  HostkeyLoginResponse,
  HostkeyServer,
} from './hostkey.types';

const BASE_URL = 'https://invapi.hostkey.ru';

/**
 * HOSTKEY InvAPI connector (https://invapi.hostkey.ru).
 * Auth: API key → session token via auth.php?action=login.
 * Account credit from whmcs.php?action=getcredits; servers from eq.php?action=list&full=1.
 * No payment ledger import in v1.
 */
export class HostkeyConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private sessionToken: string | null = null;
  private currency = 'EUR';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
  }

  kind(): string {
    return 'hostkey';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const token = await this.ensureToken(signal);
    try {
      const data = await this.postForm<HostkeyCreditsResponse>(
        '/whmcs.php',
        { action: 'getcredits', token },
        signal,
      );
      this.assertOk(data, 'getcredits');
      const balance = creditBalance(data);
      return {
        balance: balance == null ? null : new Decimal(balance),
        currency: this.currency,
      };
    } catch {
      return { balance: null, currency: this.currency };
    }
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const token = await this.ensureToken(signal);
    const data = await this.postForm<HostkeyListResponse>(
      '/eq.php',
      { action: 'list', token, full: '1' },
      signal,
    );
    this.assertOk(data, 'list');
    const nextBilling = firstOfNextMonthUtc();
    const servers = normalizeServers(data.servers);
    return servers
      .filter((s) => {
        const status = (s.status ?? '').toLowerCase();
        return !status || status === 'rent' || status === 'power_off';
      })
      .map((s) => mapHostkeyServer(s, this.currency, nextBilling));
  }

  private async ensureToken(signal: AbortSignal): Promise<string> {
    if (this.sessionToken) return this.sessionToken;
    const data = await this.postForm<HostkeyLoginResponse>(
      '/auth.php',
      { action: 'login', key: this.apiKey },
      signal,
    );
    const payload = unwrapLogin(data);
    if (!payload?.token) {
      throw new Error(`Hostkey: ${apiError(data) || 'Invalid API key'}`);
    }
    this.sessionToken = payload.token;
    this.currency = currencyFromLogin(payload);
    return this.sessionToken;
  }

  private async postForm<T>(
    path: string,
    fields: Record<string, string>,
    signal: AbortSignal,
  ): Promise<T> {
    const body = new URLSearchParams(fields);
    const { data } = await this.http.post<T>(path, body.toString(), {
      signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as T;
      } catch {
        throw new Error(`Hostkey: unexpected non-JSON response from ${path}`);
      }
    }
    return data;
  }

  private assertOk(
    data: { result?: unknown; message?: unknown; error?: unknown; code?: unknown },
    action: string,
  ) {
    if (typeof data.result === 'number' && data.result < 0) {
      throw new Error(`Hostkey: ${apiError(data) || `${action} failed`}`);
    }
    if (typeof data.result === 'string' && data.result !== 'OK') {
      throw new Error(`Hostkey: ${apiError(data) || `${action} failed`}`);
    }
    if (typeof data.code === 'number' && data.code < 0) {
      throw new Error(`Hostkey: ${apiError(data) || `${action} failed`}`);
    }
  }
}

function unwrapLogin(data: HostkeyLoginResponse): HostkeyLoginPayload | null {
  if (data.token) return data;
  const nested = data.result;
  if (nested && typeof nested === 'object' && !Array.isArray(nested) && nested.token) {
    return nested;
  }
  return null;
}

function currencyFromLogin(payload: HostkeyLoginPayload): string {
  if (payload.currency_code) return payload.currency_code.toUpperCase();
  const loc = (payload.whmcs_location ?? '').toLowerCase();
  if (loc.includes('itb') || loc.includes('ru') || loc.includes('rub')) return 'RUB';
  if (loc.includes('us') || loc.includes('usd')) return 'USD';
  return 'EUR';
}

function creditBalance(data: HostkeyCreditsResponse): number | null {
  const msg = data.message;
  if (typeof msg === 'number' && Number.isFinite(msg)) return msg;
  if (typeof msg === 'string') {
    const n = Number(msg);
    return Number.isFinite(n) ? n : null;
  }
  if (!msg || typeof msg !== 'object') return null;
  const raw = msg.credits?.credit;
  const entries: HostkeyCreditEntry[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (entries.length === 0) return 0;
  let sum = 0;
  for (const e of entries) {
    const n = Number(e.amount);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

function normalizeServers(servers: HostkeyListResponse['servers']): HostkeyServer[] {
  if (!Array.isArray(servers) || servers.length === 0) return [];
  if (typeof servers[0] === 'number') return [];
  return servers as HostkeyServer[];
}

function apiError(data: { error?: unknown; message?: unknown }): string | null {
  if (typeof data.error === 'string' && data.error) return data.error;
  if (typeof data.message === 'string' && data.message) return data.message;
  return null;
}

function firstOfNextMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
