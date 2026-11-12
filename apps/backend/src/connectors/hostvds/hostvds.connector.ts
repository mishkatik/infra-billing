import { Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { totpCode } from '../common/totp';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { mapHostvdsPayments, mapHostvdsServer, money, nextMarker } from './hostvds.mapper';
import {
  HOSTVDS_BRANDS,
  HOSTVDS_DEFAULT_BASE_URL,
  HostvdsBrand,
  HostvdsCredentials,
  HostvdsCustomer,
  HostvdsPlan,
  HostvdsRegion,
  HostvdsTransaction,
  HostvdsTransactionsPage,
  NovaServer,
  NovaServersPage,
} from './hostvds.types';

// The panel lists servers in pages of 300 as well.
const PAGE_SIZE = 300;
// The ledger API accepts large pages; the page cap only guards against a pagination loop.
const LEDGER_PAGE_SIZE = 500;
const LEDGER_MAX_PAGES = 40;

/** Website session: the cookies of a signed-in client and the customer the login returned. */
interface BillingSession {
  cookies: Map<string, string>;
  customer: HostvdsCustomer;
}

/** The website refused the email/password/TOTP code: the owner has to fix the credentials. */
class SignInRejected extends Error {}

function storeCookies(jar: Map<string, string>, setCookie: unknown): void {
  for (const line of Array.isArray(setCookie) ? setCookie : []) {
    const pair = String(line).split(';', 1)[0];
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

/** Cookie header plus the CSRF token Django expects on unsafe requests of a session. */
function sessionHeaders(jar: Map<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrf = jar.get('csrftoken__');
  if (csrf) headers['X-CSRFToken'] = csrf;
  return headers;
}

function rejection(data: unknown): string {
  const body = (data ?? {}) as Record<string, unknown>;
  const first = [body.non_field_errors, body.code, body.detail, body.message]
    .flat()
    .find((v) => typeof v === 'string' && v);
  return typeof first === 'string' ? first : 'rejected';
}

function pathOf(url: string | undefined): string {
  try {
    return url ? new URL(url).pathname : '';
  } catch {
    return url ?? '';
  }
}

/**
 * HostVDS / CloudCore connector. Both brands run one white-label panel on OpenStack; there is no
 * SDK, so a thin axios client. Servers come from Nova with the OpenStack user from the panel's
 * API tab (Keystone v3, one central Keystone, token in the `X-Subject-Token` response header).
 * Every region is a separate cluster, and some catalog regions are dead, so the regions are the
 * public list of the panel's billing API, and region URLs are built the way the panel builds them
 * (<osApi>/<region>/compute/…). Nova has no price: it comes from the public plan catalog.
 *
 * The balance and the ledger live behind the website login (email + password, optional TOTP).
 * Without it the account reports no balance (like Hetzner) and servers still sync.
 */
export class HostvdsConnector implements Connector {
  private readonly logger = new Logger(HostvdsConnector.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;
  private readonly brand: HostvdsBrand;
  private readonly creds: HostvdsCredentials;
  private token: string | null = null;
  private session: Promise<BillingSession | null> | null = null;

  constructor(creds: HostvdsCredentials) {
    const baseUrl = (creds.baseUrl ?? HOSTVDS_DEFAULT_BASE_URL).replace(/\/+$/, '');
    const brand = HOSTVDS_BRANDS[baseUrl];
    if (!brand) {
      throw new Error('HostVDS: baseUrl must be https://hostvds.com or https://cloudcore.ru');
    }
    this.baseUrl = baseUrl;
    this.brand = brand;
    this.creds = creds;
    // Neither API legitimately redirects; refuse rather than re-send the token elsewhere.
    this.http = axios.create({ timeout: REQUEST_TIMEOUT_MS, maxRedirects: 0 });
    this.http.interceptors.response.use(undefined, (e) => {
      // Never rethrow the AxiosError itself: its config carries the token or the password, and
      // sync errors end up in logs/DB. Keep only the status and the path.
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        throw new Error(
          `HostVDS: ${status ? `HTTP ${status}` : e.message} ${pathOf(e.config?.url)}`,
        );
      }
      throw e;
    });
  }

  kind(): string {
    return 'hostvds';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const session = await this.billing(signal);
    return { balance: money(session?.customer.balance) ?? null, currency: this.brand.currency };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const token = await this.keystone(signal);
    const { data } = await this.http.get<HostvdsRegion[]>(`${this.baseUrl}/api/regions/`, {
      signal,
    });
    const regions = (Array.isArray(data) ? data : []).filter(
      (r) => r.backend === 'openstack' && r.region,
    );
    // A failed region fails the whole sync: skipping it would deactivate its servers.
    const perRegion = await Promise.all(
      regions.map(async (region) => {
        const servers = await this.listServers(region.region, token, signal);
        if (servers.length === 0) return [];
        const plans = await this.plans(region.region, signal);
        return servers.map((s) => mapHostvdsServer(s, region, plans, this.brand));
      }),
    );
    return perRegion.flat();
  }

  /** Top-ups and daily charges per server; closes the website session it shares with the balance. */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const session = await this.billing(signal);
    if (!session) return [];
    const rows = await this.listTransactions(session, signal);
    // Only after a successful read: a phase retry reuses the still open session.
    await this.signOut(session, signal);
    return mapHostvdsPayments(rows, this.brand.currency);
  }

  /**
   * Website session, opened once per sync and shared by the balance and the ledger: the login
   * endpoint rate-limits hard (a second attempt within seconds gets 429), so a phase retry must
   * not sign in again — the promise, rejection included, is kept for the connector's lifetime.
   * Rejected credentials fail the sync; anything else (rate limit, outage, a challenge page)
   * only costs this run its balance and payments, servers still sync.
   */
  private billing(signal: AbortSignal): Promise<BillingSession | null> {
    if (!this.creds.email || !this.creds.webPassword) return Promise.resolve(null);
    this.session ??= this.signIn(signal).catch((e) => {
      if (signal.aborted || e instanceof SignInRejected) throw e;
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.warn(`HostVDS: website sign-in unavailable, no balance this run: ${reason}`);
      return null;
    });
    return this.session;
  }

  private async signIn(signal: AbortSignal): Promise<BillingSession> {
    const cookies = new Map<string, string>();
    const email = this.creds.email as string;
    let customer = await this.billingPost(
      'login/',
      { email, password: this.creds.webPassword },
      cookies,
      signal,
    );
    if (customer.totp_required) {
      if (!this.creds.totpSecret) {
        throw new SignInRejected(
          'HostVDS: the website login asks for a 2FA code — add the TOTP secret',
        );
      }
      customer = await this.billingPost(
        'totp/verify/',
        {
          email,
          code: totpCode(this.creds.totpSecret, Date.now()),
          totp_challenge: customer.totp_challenge,
        },
        cookies,
        signal,
      );
    }
    // The login answers with the customer; read it explicitly if a 2FA step answered otherwise.
    if (money(customer.balance) === undefined) {
      const { data } = await this.http.get<HostvdsCustomer[]>(`${this.baseUrl}/api/customers/`, {
        signal,
        headers: sessionHeaders(cookies),
      });
      if (Array.isArray(data) && data[0]) customer = data[0];
    }
    return { cookies, customer };
  }

  private async billingPost(
    path: string,
    body: Record<string, unknown>,
    cookies: Map<string, string>,
    signal: AbortSignal,
  ): Promise<HostvdsCustomer> {
    const res = await this.http.post(`${this.baseUrl}/api/${path}`, body, {
      signal,
      headers: sessionHeaders(cookies),
      validateStatus: () => true,
    });
    storeCookies(cookies, res.headers['set-cookie']);
    const json = res.data !== null && typeof res.data === 'object';
    // A wrong password or TOTP code is a JSON 400 ({"non_field_errors": ["Incorrect email or
    // password"]}); a rate limit or a DDoS-Guard page is not, and says nothing about the creds.
    if (res.status === 400 && json) {
      throw new SignInRejected(`HostVDS: website sign-in rejected — ${rejection(res.data)}`);
    }
    if (res.status >= 400 || !json) {
      throw new Error(
        `HostVDS: website sign-in failed (HTTP ${res.status}${json ? '' : ', not JSON'})`,
      );
    }
    return res.data as HostvdsCustomer;
  }

  private async listTransactions(
    session: BillingSession,
    signal: AbortSignal,
  ): Promise<HostvdsTransaction[]> {
    const rows: HostvdsTransaction[] = [];
    for (let page = 0; page < LEDGER_MAX_PAGES; page++) {
      const { data } = await this.http.get<HostvdsTransactionsPage>(
        `${this.baseUrl}/api/transactions/`,
        {
          signal,
          headers: sessionHeaders(session.cookies),
          params: { limit: LEDGER_PAGE_SIZE, offset: rows.length },
        },
      );
      const results = data.results ?? [];
      rows.push(...results);
      if (results.length === 0 || rows.length >= (data.count ?? 0)) break;
    }
    return rows;
  }

  /** Best-effort logout, so syncs don't pile up open sessions on the account. */
  private async signOut(session: BillingSession, signal: AbortSignal): Promise<void> {
    try {
      await this.http.post(
        `${this.baseUrl}/api/logout/`,
        {},
        {
          signal,
          headers: sessionHeaders(session.cookies),
        },
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.warn(`HostVDS: website logout failed: ${reason}`);
    }
  }

  /** Project-scoped Keystone token, cached for the connector's lifetime (one sync). */
  private async keystone(signal: AbortSignal): Promise<string> {
    if (this.token) return this.token;
    const { username, password } = this.creds;
    const body = {
      auth: {
        identity: {
          methods: ['password'],
          password: { user: { name: username, domain: { name: 'Default' }, password } },
        },
        // The panel's OpenStack user owns a project of the same name in the Default domain.
        scope: { project: { name: username, domain: { name: 'Default' } } },
      },
    };
    const res = await this.http.post(`${this.brand.osApi}/identity/v3/auth/tokens`, body, {
      signal,
      validateStatus: () => true,
    });
    if (res.status === 401) {
      throw new Error(
        'HostVDS: invalid OpenStack login or password (panel → API → OpenStack Dashboard)',
      );
    }
    if (res.status >= 400) throw new Error(`HostVDS: authorization failed (HTTP ${res.status})`);
    const token = res.headers['x-subject-token'];
    if (!token) throw new Error('HostVDS: token was not obtained (no X-Subject-Token header)');
    this.token = String(token);
    return this.token;
  }

  private async listServers(
    region: string,
    token: string,
    signal: AbortSignal,
  ): Promise<NovaServer[]> {
    const url = `${this.brand.osApi}/${encodeURIComponent(region)}/compute/v2.1/servers/detail`;
    const servers: NovaServer[] = [];
    let marker: string | undefined;
    do {
      const { data } = await this.http.get<NovaServersPage>(url, {
        signal,
        headers: { 'X-Auth-Token': token },
        params: marker ? { limit: PAGE_SIZE, marker } : { limit: PAGE_SIZE },
      });
      servers.push(...(data.servers ?? []));
      const next = nextMarker(data.servers_links);
      marker = next && next !== marker ? next : undefined;
    } while (marker);
    return servers;
  }

  /** Best-effort: without the catalog the region's servers stay unpriced (the sync keeps cost). */
  private async plans(region: string, signal: AbortSignal): Promise<HostvdsPlan[]> {
    try {
      const { data } = await this.http.get<HostvdsPlan[]>(`${this.baseUrl}/api/plans/`, {
        signal,
        params: { region },
      });
      return Array.isArray(data) ? data : [];
    } catch (e) {
      if (signal.aborted) throw e;
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `HostVDS: plans of ${region} unavailable, servers keep their cost: ${reason}`,
      );
      return [];
    }
  }
}
