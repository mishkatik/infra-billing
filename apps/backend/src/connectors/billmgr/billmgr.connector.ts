import { Logger } from '@nestjs/common';
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
  isPaymentCredited,
  parseBillmgrDate,
  val,
} from './billmgr.parse';
import { totpCode } from '../common/totp';
import { BillmgrCredentials, BillmgrDoc } from './billmgr.types';

// BILLmanager splits services by type, each behind its own list func. Installs can add custom
// item types whose lists live behind dotted subtypes of these base funcs (e.g. waicore's
// vds.vps next to a now-empty vds), so this static list is a baseline: fetchServices extends
// it with the subtype funcs discovered in the client menu.
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

// Some panels sit behind Cloudflare (senko), which rejects Node's TLS fingerprint outright: no header set
// gets through (verified — curl passes from the same IP, axios and node:https do not), so there is nothing
// to work around on our side and the request never reaches BILLmanager. Say that, and name the Ray ID —
// it is the first thing the hoster's support asks for.
const CF_BLOCKED_MESSAGE =
  'BILLmanager: the request was blocked by Cloudflare in front of the panel and never reached BILLmanager. ' +
  'Ask the hoster to allow API access for this server (a WAF skip rule for /billmgr, or an IP allowlist).';

/**
 * Cloudflare serves its own HTML instead of the panel's JSON when it blocks: bot protection renders
 * "Just a moment...", a WAF rule renders "Attention Required!", IP/rate blocks render an "Error 10xx" page.
 * Match those markers on a block status only — Cloudflare brands origin error pages too (521/522/524), and
 * those mean the panel is down, not that we were blocked; a bare "cloudflare" match would send the owner to
 * open a WAF ticket for an outage. The slice bounds the regex against a multi-KB page; the page itself is
 * never echoed (it would land in the DB, a UI tooltip and a Telegram message).
 */
export function isCloudflareBlock(status: number | undefined, body: unknown): boolean {
  if (status !== 403 && status !== 429 && status !== 503) return false;
  if (typeof body !== 'string') return false;
  return /just a moment|attention required|error 10\d{2}|cf-error-details/i.test(
    body.slice(0, 4096),
  );
}

/**
 * BILLmanager reports its own failures as doc.error at HTTP 200, so a non-2xx never comes from the API —
 * it comes from whatever fronts the panel (its web server: 404 on a wrong baseUrl, 5xx when the CGI is down;
 * or a CDN/WAF). Such bodies carry no useful message, so report the status and let the Cloudflare case speak
 * for itself. Never build the message out of the AxiosError itself: its config holds the func=auth body (the
 * plaintext password) and the `auth` session id, and sync errors are persisted to lastSyncError, logged and
 * pushed to Telegram. Only the status, the block markers, the cf-ray header and the func name are safe.
 */
export function billmgrHttpError(e: unknown): Error {
  // Sync-wide aborts (AbortController) must stay recognizable as cancellations.
  if (axios.isCancel(e)) return e instanceof Error ? e : new Error('canceled');
  if (!axios.isAxiosError(e)) return e instanceof Error ? e : new Error(String(e));
  const status = e.response?.status;
  if (isCloudflareBlock(status, e.response?.data)) {
    const ray = e.response?.headers?.['cf-ray'];
    return new Error(CF_BLOCKED_MESSAGE + (typeof ray === 'string' ? ` (Ray ID ${ray})` : ''));
  }
  const func = typeof e.config?.params?.func === 'string' ? ` (${e.config.params.func})` : '';
  // No response → transport failure (DNS/refused/timeout); axios's own message is safe and specific.
  return new Error(
    status
      ? `BILLmanager${func}: panel returned HTTP ${status}`
      : `BILLmanager${func}: ${e.message}`,
  );
}

/**
 * ISPsystem BILLmanager (https://docs.ispsystem.com/billmanager). CGI API at
 * `{base}/billmgr?func=...&out=json`, responses wrapped in `doc`, scalars as {"$":...}. No npm SDK.
 * Auth: POST func=auth → session (doc.auth.$id, ~1h) reused via `auth` param.
 * Balance/currency: func=whoami → doc.user.$balance/$currency. Services: per-type list funcs
 * (vds/dedic/vhost/domain/...) → doc.elem[]. 2FA: func=auth still returns a session but it stays
 * unconfirmed (data funcs return `doc.ok` instead of payload); detected on first whoami, then we
 * confirm via OTP (if a TOTP secret is set) or fail with a clear message.
 */
export class BillmgrConnector implements Connector {
  private readonly logger = new Logger(BillmgrConnector.name);
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
    // A non-2xx is never BILLmanager itself — turn it into a message that names the real reason
    // instead of leaving axios's bare "Request failed with status code 403" in lastSyncError.
    this.http.interceptors.response.use(undefined, (e) => {
      throw billmgrHttpError(e);
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
    // back as `doc.ok` (a redirect to the one-time-code form) with no `user`. Verify here,
    // and reuse this probe in fetchAccount, so we never report a green sync with 0 services.
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
      // Confirmation returns a NEW, fully-authorized session id. The original one stays
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

  private async call(
    func: string,
    signal: AbortSignal,
    extra?: Record<string, string>,
  ): Promise<BillmgrDoc> {
    const auth = await this.ensureSession(signal);
    const { data } = await this.http.get<BillmgrDoc>('', {
      params: { func, auth, out: 'json', ...extra },
      signal,
    });
    if (data?.doc?.error) throw new Error(`BILLmanager (${func}): ${billmgrError(data.doc.error)}`);
    return data;
  }

  /**
   * Page through a BILLmanager list func, accumulating doc.elem rows. Lists paginate with
   * p_num/p_cnt and report the total in p_elems; request a large page and stop at the last one.
   */
  private async listAll(
    func: string,
    signal: AbortSignal,
    extra?: Record<string, string>,
  ): Promise<Record<string, unknown>[]> {
    const PAGE = 1000;
    const rows: Record<string, unknown>[] = [];
    for (let page = 1; page <= 50; page += 1) {
      const data = await this.call(func, signal, {
        ...extra,
        p_cnt: String(PAGE),
        p_num: String(page),
      });
      const batch = asArray(data?.doc?.elem) as Record<string, unknown>[];
      rows.push(...batch);
      const total = Number(val(data?.doc?.p_elems));
      if (batch.length < PAGE || (Number.isFinite(total) && rows.length >= total)) break;
    }
    return rows;
  }

  /**
   * BILLmanager list filters are sticky and account-level: once saved (from the panel UI or via
   * API) they silently apply to every later list call of that func for the same user, so a list
   * fetched with out=json can be quietly truncated. Reset by submitting the filter form with its
   * empty defaults. The filter only APPLIES when the form is submitted normally; with out=json
   * BILLmanager just echoes the form back without saving, so this POST omits out=json.
   * Best-effort: if the reset fails we fall back to whatever filter is currently set.
   */
  private async clearListFilter(
    func: string,
    fields: Record<string, string>,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const auth = await this.ensureSession(signal);
      const body = new URLSearchParams({ func, auth, sok: 'ok', ...fields });
      await this.http.post('', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal,
      });
    } catch {
      // best-effort: a failed reset just leaves the current filter in place
    }
  }

  // e.g. "Service ID = 388", set when a single service's charges were opened in the panel.
  private clearExpenseFilter(signal: AbortSignal): Promise<void> {
    return this.clearListFilter(
      'expense.filter',
      {
        item: '',
        id: '',
        locale_name: '',
        fromdate: '',
        todate: '',
        amount: '',
        compare_type: 'null',
        notpayd_compare_type: 'null',
        notpayd_amount: '',
      },
      signal,
    );
  }

  // Empty defaults exactly as the live payment.filter form reports them (akenai): text inputs
  // blank, createdate preset "nodate" (no date restriction), restrictrefund "null".
  private clearPaymentFilter(signal: AbortSignal): Promise<void> {
    return this.clearListFilter(
      'payment.filter',
      {
        id: '',
        number: '',
        sender: '',
        sender_id: '',
        createdate: 'nodate',
        createdatestart: '',
        createdateend: '',
        payfromdate: '',
        paytodate: '',
        paymethod: '',
        status: '',
        saamount_from: '',
        saamount_to: '',
        pmamount_from: '',
        pmamount_to: '',
        restrictrefund: 'null',
      },
      signal,
    );
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

  /**
   * The client menu (func=menu, group `mainmenuservice`) lists the item funcs this install
   * actually exposes, including custom item types behind dotted subtypes of the base funcs
   * (waicore: `vds.vps` holds the servers while plain `vds` is empty). Keep the subtypes of
   * known base groups, typed as their base; ITEM_FUNCS stays the baseline (and the fallback
   * when the menu is unavailable).
   */
  private async discoverItemFuncs(signal: AbortSignal): Promise<{ func: string; type: string }[]> {
    const funcs = new Map(ITEM_FUNCS.map((f) => [f.func, f.type]));
    try {
      const data = await this.call('menu', signal);
      const mainmenu = data?.doc?.mainmenu as Record<string, unknown> | undefined;
      for (const group of asArray(mainmenu?.node) as Record<string, unknown>[]) {
        if (group.$name !== 'mainmenuservice') continue;
        for (const node of asArray(group.node) as Record<string, unknown>[]) {
          const action = typeof node.$action === 'string' ? node.$action : undefined;
          if (!action || node.$type !== 'list' || funcs.has(action)) continue;
          const baseType = funcs.get(action.split('.')[0]);
          if (baseType) funcs.set(action, baseType);
        }
      }
    } catch (err) {
      this.logger.warn(`func=menu failed, using static item funcs: ${(err as Error).message}`);
    }
    return [...funcs].map(([func, type]) => ({ func, type }));
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    // Establish (and validate) the session up front so an auth/2FA failure propagates,
    // otherwise the per-func catch below would swallow it and silently return 0 services.
    await this.ensureSession(signal);
    const out: ServiceData[] = [];
    // An item could show up under both the base func and its subtype; item ids are
    // install-wide, so dedupe by externalId.
    const seen = new Set<string>();
    for (const { func, type } of await this.discoverItemFuncs(signal)) {
      let data: BillmgrDoc;
      try {
        data = await this.call(func, signal);
      } catch {
        continue; // a type unavailable on this install, skip
      }
      for (const e of asArray(data?.doc?.elem)) {
        const svc = mapBillmgrService(e as Record<string, unknown>, type);
        if (!svc.externalId || seen.has(svc.externalId)) continue;
        seen.add(svc.externalId);
        out.push(svc);
      }
    }
    return out;
  }

  /**
   * BILLmanager exposes a ledger: func=payment (top-ups/payments) and func=expense (charges
   * for services). We import both: payments as `topup`, expenses as `charge` linked to the parent
   * service via `main_item`. Each ledger is best-effort (skipped if unavailable on the install) and
   * paged through in full; expenses are read after resetting the sticky per-service filter so every
   * service's charges come through, not just the one the panel was last filtered to.
   */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    await this.ensureSession(signal);
    const out: PaymentData[] = [];
    const seen = new Set<string>();
    const add = (p: PaymentData) => {
      if (seen.has(p.externalId)) return; // guard against page-boundary duplicates
      seen.add(p.externalId);
      out.push(p);
    };

    try {
      // Same sticky-filter hazard as expenses: a filter saved on the payments list would
      // silently hide top-ups from func=payment, so reset it first.
      await this.clearPaymentFilter(signal);
      const skippedByStatus = new Map<string, number>();
      for (const e of await this.listAll('payment', signal)) {
        const id = val(e.id);
        const amountRaw =
          val(e.paymethodamount_iso) ?? val(e.subaccountamount_iso) ?? val(e.amount);
        const amountStr = firstNumber(amountRaw);
        const date = parseBillmgrDate(val(e.pay_date) ?? val(e.create_date));
        if (!id || amountStr == null || !date) continue;
        const number = val(e.number) ?? '';
        const status = val(e.status);
        // "return/…" records are refunds: money back, so the amount is negative.
        const isRefund = number.toLowerCase().startsWith('return');
        const sign = isRefund ? -1 : 1;
        // Import only credited top-ups ("Зачислен"/"Credited"/"Paid"); skip "Новый"/"Отменён".
        // Refunds bypass the check (money already returned).
        if (!isRefund && !isPaymentCredited(status)) {
          // status is always set here — isPaymentCredited treats an absent one as credited
          skippedByStatus.set(status!, (skippedByStatus.get(status!) ?? 0) + 1);
          continue;
        }
        add({
          externalId: `payment:${id}`,
          type: 'topup',
          amount: new Decimal(amountStr).mul(sign),
          currency: currencyFromAmount(amountRaw),
          date,
          description: number ? `Payment ${number}` : 'Payment',
        });
      }
      // Surfaces unexpected localized status names (a new locale would otherwise silently
      // drop every top-up — exactly how "Credited" went missing).
      if (skippedByStatus.size) {
        const detail = [...skippedByStatus].map(([s, n]) => `"${s}" ×${n}`).join(', ');
        this.logger.log(`func=payment: skipped non-credited payment(s): ${detail}`);
      }
    } catch (err) {
      // ledger unavailable / insufficient privileges — top-ups just miss this run
      this.logger.warn(`func=payment list failed, top-ups not imported: ${(err as Error).message}`);
    }

    try {
      // Drop the sticky per-service filter first, otherwise we only see one service's charges.
      await this.clearExpenseFilter(signal);
      for (const e of await this.listAll('expense', signal)) {
        const id = val(e.id);
        const amountStr = firstNumber(val(e.amount));
        const date = parseBillmgrDate(val(e.realdate) ?? val(e.realdate_l));
        if (!id || amountStr == null || !date) continue;
        add({
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
    } catch (err) {
      // ledger unavailable — charges just miss this run
      this.logger.warn(`func=expense list failed, charges not imported: ${(err as Error).message}`);
    }

    return out;
  }
}
