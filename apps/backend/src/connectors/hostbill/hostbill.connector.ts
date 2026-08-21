import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { normalizeCurrency } from '../common/currency';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  HOSTBILL_FALLBACK_CURRENCY,
  invoiceToPayment,
  isActiveHostbillService,
  mapHostbillService,
} from './hostbill.mapper';
import {
  BalanceResponse,
  HostbillCredentials,
  InvoicesResponse,
  LoginResponse,
  ServicesResponse,
} from './hostbill.types';

/**
 * HostBill User API connector (https://hostbill.atlassian.net/wiki/...). Each install
 * lives on its own domain and the API base path varies (e.g. /api), so the base URL is
 * configured per provider. Auth: JWT, POST /login (username=email + password) → token,
 * then Bearer on each request. Some installs have a broken JWT issuer but working Basic
 * auth (e.g. Clouvider answers /login with internal_error_0); on any login failure other
 * than bad credentials we probe /details with Basic and switch to it. No npm SDK.
 * Balance: GET /balance (acc_credit). Services: GET /service. Billing is per-cycle.
 */
export class HostbillConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly creds: HostbillCredentials;
  private token: string | null = null;
  private useBasic = false;

  constructor(creds: HostbillCredentials) {
    this.creds = creds;
    this.http = axios.create({
      baseURL: creds.baseUrl.replace(/\/+$/, ''),
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  kind(): string {
    return 'hostbill';
  }

  /** Auth header for requests: cached JWT via POST /login, or Basic once fallen back. */
  private async authHeaders(signal: AbortSignal): Promise<Record<string, string>> {
    if (this.useBasic) return this.basicHeader();
    if (!this.token) {
      const { data } = await this.http.post<LoginResponse>(
        'login',
        { username: this.creds.username, password: this.creds.password },
        { signal },
      );
      // HostBill returns 200 with { error: [...] } on bad credentials.
      if (data?.error) {
        const errors = Array.isArray(data.error) ? data.error : [data.error];
        const loginError = new Error(`HostBill: ${errors.join(', ')}`);
        // wronglogin = bad credentials, Basic would fail the same way.
        if (errors.includes('wronglogin')) throw loginError;
        return this.basicFallback(signal, loginError);
      }
      this.token = data?.token ?? data?.access_token ?? null;
      if (!this.token) {
        return this.basicFallback(signal, new Error('HostBill login: token was not obtained'));
      }
    }
    return { Authorization: `Bearer ${this.token}` };
  }

  /** Probe /details with Basic auth; on success switch to it, otherwise surface the login error. */
  private async basicFallback(
    signal: AbortSignal,
    loginError: Error,
  ): Promise<Record<string, string>> {
    const headers = this.basicHeader();
    try {
      await this.http.get('details', { headers, signal });
    } catch {
      throw loginError;
    }
    this.useBasic = true;
    return headers;
  }

  private basicHeader(): Record<string, string> {
    const encoded = Buffer.from(`${this.creds.username}:${this.creds.password}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const headers = await this.authHeaders(signal);
    const { data } = await this.http.get<BalanceResponse>('balance', { headers, signal });
    const d = data?.details ?? {};
    // /balance frequently returns an empty currency. Fall back to the account's
    // real currency from invoices (e.g. TRY), not a blanket USD.
    let currency = normalizeCurrency(d.currency, ''); // '' = unknown
    if (!currency) {
      currency = (await this.accountCurrencyFromInvoices(signal)) ?? HOSTBILL_FALLBACK_CURRENCY;
    }
    // acc_credit = prepaid funds available to the client.
    return {
      balance: new Decimal(d.acc_credit ?? d.acc_balance ?? 0),
      currency,
    };
  }

  /** Account currency from the first invoice that has one (an account has a single currency). */
  private async accountCurrencyFromInvoices(signal: AbortSignal): Promise<string | null> {
    try {
      const headers = await this.authHeaders(signal);
      const { data } = await this.http.get<InvoicesResponse>('invoice', { headers, signal });
      for (const inv of data?.invoices ?? []) {
        const c = normalizeCurrency(inv.currency, '');
        if (c) return c;
      }
    } catch {
      // best-effort: a failing /invoice must not break balance sync
    }
    return null;
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const headers = await this.authHeaders(signal);
    const { data } = await this.http.get<ServicesResponse>('service', { headers, signal });
    return (data?.services ?? []).filter(isActiveHostbillService).map(mapHostbillService);
  }

  /**
   * HostBill exposes invoices (bills) but no per-service expense breakdown and no transaction
   * ledger (its /payment endpoint only lists gateway names). We import PAID invoices as payments
   * (type=topup, dated by datepaid → counted in totalSpent). Unpaid invoices aren't payment facts.
   */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const headers = await this.authHeaders(signal);
    const { data } = await this.http.get<InvoicesResponse>('invoice', { headers, signal });
    const out: PaymentData[] = [];
    for (const inv of data?.invoices ?? []) {
      const payment = invoiceToPayment(inv);
      if (payment) out.push(payment);
    }
    return out;
  }
}
