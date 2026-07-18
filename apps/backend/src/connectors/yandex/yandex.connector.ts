import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import jwt from 'jsonwebtoken';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { fetchResourceExpense, fetchUsageReport } from './yandex.consumption';
import { aggregateUsageByDay, mapYandexInstance } from './yandex.mapper';
import {
  BillingAccountsResponse,
  IamTokenResponse,
  YandexBillingAccount,
  YandexCredentials,
  YandexInstance,
} from './yandex.types';

const IAM_URL = 'https://iam.api.cloud.yandex.net/iam/v1/tokens';
const IAM_SA_URL = 'https://iam.api.cloud.yandex.net/iam/v1/serviceAccounts';
const BILLING_URL = 'https://billing.api.cloud.yandex.net/billing/v1';
const RESOURCE_MANAGER_URL = 'https://resource-manager.api.cloud.yandex.net/resource-manager/v1';
const COMPUTE_URL = 'https://compute.api.cloud.yandex.net/compute/v1';

const PAGE_SIZE = 1000; // Yandex Cloud list APIs cap page_size at 1000
const MAX_PAGES = 50; // safety cap against a misbehaving pagination contract
// Authorized-key JWTs may live at most one hour; refresh the IAM token a little early.
const TOKEN_TTL_MS = 55 * 60 * 1000;
// How many months of consumption history to import on each sync.
const CONSUMPTION_MONTHS = 3;

/**
 * Yandex Cloud connector. Auth: a service-account authorized key (JSON) is signed into a JWT
 * (PS256) and exchanged for a short-lived IAM token, sent as `Authorization: Bearer`. Balance +
 * currency come from the Billing API (`/billingAccounts`, first active); servers from the Compute
 * API (`/instances`), scanning the service account's own folder (resolved from its
 * `service_account_id` via IAM), which is the folder the key already grants access to. Compute is
 * usage-billed with no per-instance price in the Compute API, so each server's "monthly cost" is
 * last full month's actual consumption pulled per resource from the Billing Usage API. No
 * maintained npm SDK → thin axios client, like the other connectors. Consumption history comes from
 * the Billing Usage API, which is gRPC-only — see ./yandex.consumption.ts.
 */
export class YandexConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly creds: YandexCredentials;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(creds: YandexCredentials) {
    this.creds = creds;
    this.http = axios.create({ timeout: REQUEST_TIMEOUT_MS });
    // Surface Yandex Cloud's structured error ({ code, message }) instead of a bare HTTP status.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as { message?: string } | undefined;
        if (body?.message) throw new Error(`Yandex Cloud: ${body.message}`);
      }
      throw e;
    });
  }

  kind(): string {
    return 'yandex';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const account = await this.resolveBillingAccount(signal);
    if (!account) return { balance: null, currency: 'RUB' };
    return {
      balance: new Decimal(account.balance || '0'),
      currency: (account.currency || 'RUB').toUpperCase(),
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const folderIds = await this.resolveFolderIds(signal);
    const perFolder = await Promise.allSettled(
      folderIds.map((folderId) =>
        this.paginate<YandexInstance>(
          `${COMPUTE_URL}/instances`,
          'instances',
          { folderId },
          signal,
        ),
      ),
    );
    const services = perFolder
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .map(mapYandexInstance);
    await this.attachMonthlyCost(services, signal);
    return services;
  }

  /**
   * Fill in each server's monthly cost and next-billing date. Compute is usage-billed, so the
   * "monthly cost" is last full month's actual billable consumption of that instance, pulled from
   * the Billing Usage API per resource; the next-billing date is the start of the next month (when
   * Yandex closes the current billing period), the same for every server. Best-effort: a missing
   * billing role or a report error leaves cost unset without failing the sync.
   */
  private async attachMonthlyCost(services: ServiceData[], signal: AbortSignal): Promise<void> {
    if (services.length === 0) return;
    const nextBilling = firstOfNextMonthUtc();
    for (const s of services) s.nextBilling = nextBilling;
    const account = await this.resolveBillingAccount(signal);
    if (!account) return;
    const token = await this.iamToken(signal);
    const { start, end } = previousFullMonthUtc();
    const currency = (account.currency || 'RUB').toUpperCase();
    for (const s of services) {
      if (signal.aborted) return;
      try {
        const expense = await fetchResourceExpense(
          account.id,
          token,
          start,
          end,
          s.externalId,
          signal,
        );
        if (expense != null) {
          s.cost = new Decimal(expense);
          s.currency = currency;
          s.period = 'monthly';
        }
      } catch {
        // Best-effort: leave this server's cost unset and keep the sync going.
      }
    }
  }

  /**
   * Import consumption as one `charge` per day from the Billing Usage API (gRPC). Account-wide, to
   * match the balance; needs the `billing.accounts.getReport` permission. Returns nothing when no
   * billing account resolves (missing role / no account); a permission or rate-limit error is
   * thrown with guidance and left non-fatal by the sync.
   */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const account = await this.resolveBillingAccount(signal);
    if (!account) return [];
    const token = await this.iamToken(signal);
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - CONSUMPTION_MONTHS, 1),
    );
    const { currency, periodic } = await fetchUsageReport(account.id, token, start, now, signal);
    return aggregateUsageByDay(periodic, (currency || account.currency || 'RUB').toUpperCase());
  }

  /**
   * The scope the connector will actually use: the folders scanned for servers and the billing
   * account used for balance / consumption. Powers the provider form's read-only badges. Auth
   * errors on the key surface to the caller; a missing billing role degrades to a null account.
   */
  async discover(signal: AbortSignal): Promise<{
    folders: { id: string; name: string }[];
    billingAccount: { id: string; name: string } | null;
  }> {
    const [folders, account] = await Promise.all([
      this.resolveFolders(signal),
      this.resolveBillingAccount(signal),
    ]);
    return {
      folders,
      billingAccount: account ? { id: account.id, name: account.name || account.id } : null,
    };
  }

  /**
   * The folder to scan for servers: the service account's own folder, resolved from its
   * `service_account_id` via IAM. There is no account-wide instance list (Compute lists per
   * folder), and enumerating clouds needs cloud-level rights a scoped key doesn't have, so we use
   * the home folder — the one the key already grants access to.
   */
  private async resolveFolders(signal: AbortSignal): Promise<{ id: string; name: string }[]> {
    const home = await this.homeFolder(signal);
    return home ? [home] : [];
  }

  /** The service account's own folder (id + name), read from IAM by its `service_account_id`. */
  private async homeFolder(signal: AbortSignal): Promise<{ id: string; name: string } | null> {
    const headers = await this.authHeaders(signal);
    const sa = await this.http.get<{ folderId?: string }>(
      `${IAM_SA_URL}/${this.creds.serviceAccountId}`,
      { headers, signal, validateStatus: (s) => s === 200 || s === 403 || s === 404 },
    );
    const folderId = sa.status === 200 ? sa.data.folderId : undefined;
    if (!folderId) return null;
    const folder = await this.http.get<{ name?: string }>(
      `${RESOURCE_MANAGER_URL}/folders/${folderId}`,
      { headers, signal, validateStatus: (s) => s === 200 || s === 403 || s === 404 },
    );
    return { id: folderId, name: (folder.status === 200 && folder.data.name) || folderId };
  }

  /**
   * The first active billing account (falls back to the first of any). Balance is secondary to the
   * server inventory, so a missing billing role (403) degrades to "no balance" (null) rather than
   * failing the whole sync.
   */
  private async resolveBillingAccount(signal: AbortSignal): Promise<YandexBillingAccount | null> {
    const headers = await this.authHeaders(signal);
    const res = await this.http.get<BillingAccountsResponse>(`${BILLING_URL}/billingAccounts`, {
      headers,
      signal,
      validateStatus: (s) => s === 200 || s === 403,
    });
    const accounts = res.status === 200 ? (res.data.billingAccounts ?? []) : [];
    return accounts.find((a) => a.active) ?? accounts[0] ?? null;
  }

  /** Folder ids to scan for servers (the same set surfaced as badges by `discover`). */
  private async resolveFolderIds(signal: AbortSignal): Promise<string[]> {
    return (await this.resolveFolders(signal)).map((f) => f.id);
  }

  /** Cached IAM token, minted from a freshly signed JWT when missing or near expiry. */
  private async iamToken(signal: AbortSignal): Promise<string> {
    if (!this.token || Date.now() >= this.token.expiresAt) {
      this.token = { value: await this.mintIamToken(signal), expiresAt: Date.now() + TOKEN_TTL_MS };
    }
    return this.token.value;
  }

  private async authHeaders(signal: AbortSignal): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.iamToken(signal)}` };
  }

  /** Sign a PS256 JWT with the authorized key and exchange it for an IAM token. */
  private async mintIamToken(signal: AbortSignal): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    let assertion: string;
    try {
      assertion = jwt.sign(
        { iss: this.creds.serviceAccountId, aud: IAM_URL, iat: now, exp: now + 3600 },
        this.creds.privateKey,
        { algorithm: 'PS256', keyid: this.creds.keyId },
      );
    } catch {
      throw new Error('Yandex Cloud: invalid authorized key (could not sign the JWT)');
    }
    const { data } = await this.http.post<IamTokenResponse>(
      IAM_URL,
      { jwt: assertion },
      { signal },
    );
    if (!data.iamToken) throw new Error('Yandex Cloud: IAM token was not issued');
    return data.iamToken;
  }

  /** Walk a Yandex Cloud list endpoint's pageToken/nextPageToken pagination, accumulating `key`. */
  private async paginate<T>(
    url: string,
    key: string,
    params: Record<string, string>,
    signal: AbortSignal,
  ): Promise<T[]> {
    const headers = await this.authHeaders(signal);
    const out: T[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await this.http.get<Record<string, unknown>>(url, {
        headers,
        params: { ...params, pageSize: PAGE_SIZE, pageToken },
        signal,
      });
      out.push(...((data[key] as T[]) ?? []));
      pageToken = data.nextPageToken as string | undefined;
      if (!pageToken) break;
    }
    return out;
  }
}

/** [start, end) of the previous calendar month in UTC, for the per-server consumption report. */
function previousFullMonthUtc(now = new Date()): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/** Start of next month in UTC: when Yandex closes the current billing period. */
function firstOfNextMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
