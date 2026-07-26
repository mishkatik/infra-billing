import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, ServiceData } from '../connector.interface';
import { mapHostkeyServer } from './hostkey.mapper';
import {
  HostkeyCreditsResponse,
  HostkeyListResponse,
  HostkeyLoginResponse,
} from './hostkey.types';

const BASE_URL = 'https://invapi.hostkey.ru';

/**
 * HOSTKEY InvAPI connector (https://invapi.hostkey.ru).
 * Auth: API key → session token via auth.php?action=login.
 * Account credit from whmcs.php?action=getcredits; servers from eq.php?action=list
 * (prebill_rate / prebill_period). No payment ledger import in v1.
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
    const data = await this.postForm<HostkeyCreditsResponse>(
      '/whmcs.php',
      { action: 'getcredits', token },
      signal,
    );
    this.assertOk(data, 'getcredits');
    const amount = Number(data.message ?? 0);
    return {
      balance: new Decimal(Number.isFinite(amount) ? amount : 0),
      currency: this.currency,
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const token = await this.ensureToken(signal);
    const data = await this.postForm<HostkeyListResponse>(
      '/eq.php',
      { action: 'list', token },
      signal,
    );
    this.assertOk(data, 'list');
    const nextBilling = firstOfNextMonthUtc();
    return (data.servers ?? [])
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
    if (!data.token) {
      const msg = data.message || 'Invalid API key';
      throw new Error(`Hostkey: ${msg}`);
    }
    this.sessionToken = data.token;
    if (data.currency_code) this.currency = data.currency_code.toUpperCase();
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
    return data;
  }

  private assertOk(data: { result?: string; message?: unknown; code?: number }, action: string) {
    if (data.result && data.result !== 'OK') {
      const msg = typeof data.message === 'string' ? data.message : `${action} failed`;
      throw new Error(`Hostkey: ${msg}`);
    }
    if (typeof data.code === 'number' && data.code < 0) {
      const msg = typeof data.message === 'string' ? data.message : `${action} failed`;
      throw new Error(`Hostkey: ${msg}`);
    }
  }
}

function firstOfNextMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
