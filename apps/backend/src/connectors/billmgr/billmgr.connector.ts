import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { normalizeCurrency } from '../common/currency';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { mapBillmgrService } from './billmgr.mapper';
import {
  asArray,
  billmgrError,
  currencyFromAmount,
  firstNumber,
  parseBillmgrDate,
  val,
} from './billmgr.parse';
import { totpCode } from './billmgr.totp';
import { BillmgrCredentials, BillmgrDoc } from './billmgr.types';

// BILLmanager splits services by type, each behind its own list func.
const ITEM_FUNCS: { func: string; type: string }[] = [
  { func: 'vds', type: 'vps' },
  { func: 'dedic', type: 'dedicated' },
  { func: 'vhost', type: 'other' }, // shared hosting
  { func: 'domain', type: 'domain' },
  { func: 'certificate', type: 'license' },
];

// Shown when 2FA is pending and no TOTP secret was provided. func=auth returns a session, but
// it is unconfirmed (data funcs redirect to the one-time-code form). For OTP-based 2FA we can
// confirm automatically given the secret; for SMS there is no secret to store. Kept short so it
// survives the notification's 200-char clamp.
const TWO_FACTOR_MESSAGE =
  'BILLmanager: 2FA is enabled on the account. If it is OTP (Google Authenticator) — add the TOTP secret ' +
  'in the provider settings and the sync will confirm the code itself. SMS-2FA cannot be automated — disable it.';

const TOTP_FAILED_MESSAGE =
  'BILLmanager: failed to confirm login via OTP — check the TOTP secret (the same one as in your authenticator app) ' +
  'and the server clock synchronization.';

/**
 * ISPsystem BILLmanager connector (https://docs.ispsystem.com/billmanager). CGI API at
 * `{base}/billmgr?func=...&out=json`, responses wrapped in `doc`, scalars as {"$":...}.
 * Auth: POST func=auth → session (doc.auth.$id, ~1h) reused via `auth` param. No npm SDK.
 * Balance/currency: func=whoami → doc.user.$balance/$currency. Services: per-type list
 * funcs (vds/dedic/vhost/domain/...) → doc.elem[]. 2FA: func=auth still returns a session,
 * but it stays unconfirmed (data funcs return `doc.ok` instead of payload); we detect that on
 * first whoami and either confirm via OTP (if a TOTP secret is set) or fail with a clear message.
 */
export class BillmgrConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly creds: BillmgrCredentials;
  private session: string | null = null;
  private whoamiDoc: BillmgrDoc | null = null; // cached by ensureSession's auth-verification probe

  constructor(creds: BillmgrCredentials) {
    this.creds = creds;
    this.http = axios.create({
      baseURL: creds.baseUrl.replace(/\/+$/, ''),
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  kind(): string {
    return 'billmgr';
  }

  private async ensureSession(signal: AbortSignal): Promise<string> {
    if (this.session) return this.session;
    const body = new URLSearchParams({
      func: 'auth',
      username: this.creds.username,
      password: this.creds.password,
      out: 'json',
    });
    const { data } = await this.http.post<BillmgrDoc>('', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal,
    });
    if (data?.doc?.error) throw new Error(`BILLmanager: ${billmgrError(data.doc.error)}`);
    const id = data?.doc?.auth?.$id ?? data?.doc?.session?.$id;
    if (!id) throw new Error('BILLmanager: session was not obtained');

    // The session id alone doesn't prove the session is usable: with 2FA enabled, func=auth
    // returns an id but the session is unconfirmed, and whoami (like every data func) comes
    // back as `doc.ok` (a redirect to the one-time-code form) with no `user`. Verify here —
    // and reuse this probe in fetchAccount — so we never report a green sync with 0 services.
    let probe = await this.http.get<BillmgrDoc>('', {
      params: { func: 'whoami', auth: id, out: 'json' },
      signal,
    });
    let doc = probe.data?.doc;
    if (doc?.error) throw new Error(`BILLmanager: ${billmgrError(doc.error)}`);

    let sessionId = id;
    if (!doc?.user && doc?.ok !== undefined) {
      // 2FA pending. With an OTP secret we generate the code and confirm the session; without
      // one we can't supply the rotating code, so fail with guidance instead of 0 services.
      if (!this.creds.totpSecret) throw new Error(TWO_FACTOR_MESSAGE);
      // Confirmation returns a NEW, fully-authorized session id — the original one stays
      // half-privileged ("insufficient privileges"), so we must switch to the new id.
      sessionId = await this.confirmTotp(id, signal);
      probe = await this.http.get<BillmgrDoc>('', {
        params: { func: 'whoami', auth: sessionId, out: 'json' },
        signal,
      });
      doc = probe.data?.doc;
      if (doc?.error) throw new Error(`BILLmanager: ${billmgrError(doc.error)}`);
      if (!doc?.user) throw new Error(TOTP_FAILED_MESSAGE);
    }

    this.session = sessionId;
    this.whoamiDoc = probe.data ?? null;
    return sessionId;
  }

  /**
   * Confirm an OTP-2FA session by submitting the current TOTP code to func=totp.confirm.
   * Returns the fresh session id that BILLmanager issues on success (the old one is no longer
   * fully privileged); falls back to the original id if none is returned.
   */
  private async confirmTotp(auth: string, signal: AbortSignal): Promise<string> {
    const code = totpCode(this.creds.totpSecret as string, Date.now());
    // COREmanager form submit: the code goes in field `qrcode`, `sok=ok` triggers processing.
    const body = new URLSearchParams({
      func: 'totp.confirm',
      auth,
      qrcode: code,
      sok: 'ok',
      out: 'json',
    });
    const { data } = await this.http.post<BillmgrDoc>('', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal,
    });
    if (data?.doc?.error) throw new Error(`BILLmanager: ${billmgrError(data.doc.error)}`);
    return data?.doc?.auth?.$id ?? auth;
  }

  private async call(func: string, signal: AbortSignal): Promise<BillmgrDoc> {
    const auth = await this.ensureSession(signal);
    const { data } = await this.http.get<BillmgrDoc>('', {
      params: { func, auth, out: 'json' },
      signal,
    });
    if (data?.doc?.error) throw new Error(`BILLmanager (${func}): ${billmgrError(data.doc.error)}`);
    return data;
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    await this.ensureSession(signal);
    // ensureSession already fetched (and validated) whoami; reuse it instead of a 2nd request.
    const data = this.whoamiDoc ?? (await this.call('whoami', signal));
    const u = data?.doc?.user ?? {};
    const balanceStr = firstNumber(u.$balance == null ? undefined : String(u.$balance));
    return {
      balance: balanceStr != null ? new Decimal(balanceStr) : null,
      currency: normalizeCurrency(u.$currency == null ? undefined : String(u.$currency)),
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    // Establish (and validate) the session up front so an auth/2FA failure propagates —
    // otherwise the per-func catch below would swallow it and silently return 0 services.
    await this.ensureSession(signal);
    const out: ServiceData[] = [];
    for (const { func, type } of ITEM_FUNCS) {
      let data: BillmgrDoc;
      try {
        data = await this.call(func, signal);
      } catch {
        continue; // a type unavailable on this install — skip
      }
      for (const e of asArray(data?.doc?.elem))
        out.push(mapBillmgrService(e as Record<string, unknown>, type));
    }
    return out;
  }

  /**
   * BILLmanager exposes a ledger: func=payment (top-ups/payments) and func=expense (charges
   * for services). We import both — payments as `topup`, expenses as `charge` linked to the parent
   * service via `main_item`. Each ledger is best-effort (skipped if unavailable on the install).
   */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    await this.ensureSession(signal);
    const out: PaymentData[] = [];

    try {
      const data = await this.call('payment', signal);
      for (const raw of asArray(data?.doc?.elem)) {
        const e = raw as Record<string, unknown>;
        const id = val(e.id);
        const amountRaw =
          val(e.paymethodamount_iso) ?? val(e.subaccountamount_iso) ?? val(e.amount);
        const amountStr = firstNumber(amountRaw);
        const date = parseBillmgrDate(val(e.pay_date) ?? val(e.create_date));
        if (!id || amountStr == null || !date) continue;
        const number = val(e.number) ?? '';
        // "return/…" records are refunds — money back, so the amount is negative.
        const sign = number.toLowerCase().startsWith('return') ? -1 : 1;
        out.push({
          externalId: `payment:${id}`,
          type: 'topup',
          amount: new Decimal(amountStr).mul(sign),
          currency: currencyFromAmount(amountRaw),
          date,
          description: number ? `Payment ${number}` : 'Payment',
        });
      }
    } catch {
      // payment ledger unavailable / insufficient privileges — skip
    }

    try {
      const data = await this.call('expense', signal);
      for (const raw of asArray(data?.doc?.elem)) {
        const e = raw as Record<string, unknown>;
        const id = val(e.id);
        const amountStr = firstNumber(val(e.amount));
        const date = parseBillmgrDate(val(e.realdate) ?? val(e.realdate_l));
        if (!id || amountStr == null || !date) continue;
        out.push({
          externalId: `expense:${id}`,
          type: 'charge',
          amount: new Decimal(amountStr),
          currency: currencyFromAmount(val(e.amount)),
          date,
          description: val(e.locale_name) ?? val(e.intname),
          // main_item = parent service id (matches a Service.externalId, e.g. a VDS).
          serviceExternalId: val(e.main_item) ?? val(e.item),
        });
      }
    } catch {
      // expense ledger unavailable — skip
    }

    return out;
  }
}
