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
 * configured per provider. Auth: JWT — POST /login (username=email + password) → token,
 * then Bearer on each request (Basic auth isn't enabled on all installs). No npm SDK.
 * Balance: GET /balance (acc_credit). Services: GET /service. Billing is per-cycle.
 */
export class HostbillConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly creds: HostbillCredentials;
  private token: string | null = null;

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

  /** Obtain (and cache) a JWT via POST /login, returning the Bearer auth header. */
  private async authHeaders(signal: AbortSignal): Promise<Record<string, string>> {
    if (!this.token) {
      const { data } = await this.http.post<LoginResponse>(
        'login',
        { username: this.creds.username, password: this.creds.password },
        { signal },
      );
      // HostBill returns 200 with { error: [...] } on bad credentials.
      if (data?.error) {
        throw new Error(
          `HostBill: ${Array.isArray(data.error) ? data.error.join(', ') : String(data.error)}`,
        );
      }
      this.token = data?.token ?? data?.access_token ?? null;
      if (!this.token) throw new Error('HostBill login: token was not obtained');
    }
    return { Authorization: `Bearer ${this.token}` };
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const headers = await this.authHeaders(signal);
    const { data } = await this.http.get<BalanceResponse>('balance', { headers, signal });
    const d = data?.details ?? {};
    // acc_credit = prepaid funds available to the client.
    return {
      balance: new Decimal(d.acc_credit ?? d.acc_balance ?? 0),
      currency: normalizeCurrency(d.currency, HOSTBILL_FALLBACK_CURRENCY),
    };
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
