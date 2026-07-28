import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { mapAezaPayments, mapAezaService } from './aeza.mapper';
import {
  AEZA_API_PATH,
  AEZA_BASE_URLS,
  AEZA_DEFAULT_BASE_URL,
  AezaAccount,
  AezaCredentials,
  AezaPaged,
  AezaService,
  AezaTransaction,
  normalizeAezaBaseUrl,
} from './aeza.types';

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // safety cap against a misbehaving pagination contract

/**
 * Aeza connector. Auth: API key in the X-API-KEY header (created in the panel → API Keys). Money is
 * in minor units (cents/kopecks) → divided by 100. Servers from /services (offset/limit pagination,
 * { items, total }); balance + currency from /accounts/me (prepaid: positive = funds). Billing from
 * /billing/transactions (replenishment/refund/compensation → topup, the rest → charge). No npm SDK
 * → thin axios client.
 *
 * Two independent branches (my.aeza.net and the Russian my.aeza.ru) run the same API; `baseUrl`
 * picks which one the key belongs to, defaulting to .net. Keys are not interchangeable between
 * branches, so the host is part of the credentials.
 */
export class AezaConnector implements Connector {
  private readonly http: AxiosInstance;
  private cachedCurrency?: string;

  constructor(creds: AezaCredentials) {
    const baseUrl = creds.baseUrl ? normalizeAezaBaseUrl(creds.baseUrl) : AEZA_DEFAULT_BASE_URL;
    // Hard allowlist: anything else would send the API key to a foreign host.
    if (!baseUrl) {
      throw new Error(`Aeza: baseUrl must be ${AEZA_BASE_URLS.join(' or ')}`);
    }
    this.http = axios.create({
      baseURL: `${baseUrl}${AEZA_API_PATH}`,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'X-API-KEY': creds.token },
      // The JSON API never legitimately redirects; refuse rather than re-send the key elsewhere.
      maxRedirects: 0,
    });
    // Surface Aeza's structured error body ({ error / message }) instead of a bare HTTP status.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as { error?: string; message?: string } | undefined;
        const msg = body?.message || body?.error;
        if (msg) throw new Error(`Aeza: ${msg}`);
      }
      throw e;
    });
  }

  kind(): string {
    return 'aeza';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<AezaAccount>('/accounts/me', { signal });
    this.cachedCurrency = data.currency;
    return { balance: new Decimal(String(data.balance ?? 0)).div(100), currency: data.currency };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const services = await this.paginate<AezaService>('/services', signal);
    return services.filter((s) => s.status !== 'deleted').map(mapAezaService);
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const currency = await this.currency(signal);
    const txns = await this.paginate<AezaTransaction>('/billing/transactions', signal);
    const performed = txns.filter((t) => t.status === 'performed');
    return mapAezaPayments(performed, currency);
  }

  /** Account currency, fetched once (transactions carry no per-row currency). */
  private async currency(signal: AbortSignal): Promise<string> {
    if (this.cachedCurrency) return this.cachedCurrency;
    const { data } = await this.http.get<AezaAccount>('/accounts/me', { signal });
    this.cachedCurrency = data.currency;
    return data.currency;
  }

  /** Walk Aeza's offset/limit pagination, accumulating `items` until `total` is reached. */
  private async paginate<T>(path: string, signal: AbortSignal): Promise<T[]> {
    const out: T[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await this.http.get<AezaPaged<T>>(path, {
        params: { offset: page * PAGE_SIZE, limit: PAGE_SIZE },
        signal,
      });
      const items = data.items ?? [];
      out.push(...items);
      if (items.length < PAGE_SIZE || out.length >= (data.total ?? out.length)) break;
    }
    return out;
  }
}
