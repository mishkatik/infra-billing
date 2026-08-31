import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { normalizeCurrency } from '../common/currency';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { totpCode } from '../common/totp';
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

const TWO_FACTOR_MESSAGE =
  'HostBill: authenticator-app (TOTP) 2FA is enabled but no TOTP secret is set. Add the base32 ' +
  'TOTP secret in the provider settings so the sync can generate the one-time code itself.';

const TOTP_FAILED_MESSAGE =
  'HostBill: the 2FA code was rejected — check the TOTP secret and the server clock.';

/**
 * HostBill User API connector (https://hostbill.atlassian.net/wiki/...). Each install
 * lives on its own domain and the API base path varies (e.g. /api), so the base URL is
 * configured per provider. Auth: JWT, POST /login (username=email + password) → token,
 * then Bearer on each request. Some installs have a broken JWT issuer but working Basic
 * auth (e.g. Clouvider answers /login with internal_error_0); on any login failure other
 * than bad credentials we probe /details with Basic and switch to it. No npm SDK.
 * 2FA: on installs with the MFA verify routes (User API, 2026-08+) /login returns token=null
 * plus an mfa challenge; for authenticator-app (TOTP) 2FA we solve it via POST /mfa/verify with
 * a generated code (needs the base32 secret). Balance: GET /balance (acc_credit). Services:
 * GET /service. Billing is per-cycle.
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
      // 2FA-enabled account: /login leaves token null and returns an mfa challenge — solve it
      // with a generated TOTP code (only installs updated to the User API MFA routes reach here;
      // older ones never send an mfa object and fall through to the basicFallback below).
      if (!this.token && data?.mfa) {
        this.token = await this.solveMfa(data.mfa, signal);
      }
      if (!this.token) {
        return this.basicFallback(signal, new Error('HostBill login: token was not obtained'));
      }
    }
    return { Authorization: `Bearer ${this.token}` };
  }

  /**
   * Solve the /login MFA challenge for a 2FA-enabled account: submit a generated TOTP code to
   * POST /mfa/verify (authorized by the short-lived mfa token as Bearer) and return the real JWT.
   * Only authenticator-app (TOTP) 2FA can be automated — SMS/email methods need a delivered code.
   */
  private async solveMfa(
    mfa: NonNullable<LoginResponse['mfa']>,
    signal: AbortSignal,
  ): Promise<string> {
    const methods = mfa.methods ?? [];
    if (!methods.includes('google_authenticator')) {
      throw new Error(
        `HostBill: 2FA method ${methods.join(', ') || 'unknown'} cannot be automated — ` +
          'switch the account to an authenticator app (TOTP) or disable 2FA.',
      );
    }
    if (!this.creds.totpSecret) throw new Error(TWO_FACTOR_MESSAGE);
    if (!mfa.token) throw new Error(TOTP_FAILED_MESSAGE);
    const { data } = await this.http.post<LoginResponse>(
      'mfa/verify',
      {
        method: 'google_authenticator',
        payload: { code: totpCode(this.creds.totpSecret, Date.now()) },
      },
      { headers: { Authorization: `Bearer ${mfa.token}` }, signal },
    );
    const token = data?.token ?? data?.access_token ?? null;
    if (!token) throw new Error(TOTP_FAILED_MESSAGE);
    return token;
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
