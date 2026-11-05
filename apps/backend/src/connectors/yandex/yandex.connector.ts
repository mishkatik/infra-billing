import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import jwt from 'jsonwebtoken';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { fetchResourceUsageReport, fetchUsageReport } from './yandex.consumption';
import {
  aggregateUsageByDay,
  MSK_OFFSET_MS,
  mapYandexBucket,
  mapYandexCdnResource,
  mapYandexInstance,
  monthlyCostByResource,
} from './yandex.mapper';
import {
  BillingAccountsResponse,
  IamTokenResponse,
  YandexBillingAccount,
  YandexBucket,
  YandexCdnResource,
  YandexCredentials,
  YandexInstance,
} from './yandex.types';

const IAM_URL = 'https://iam.api.cloud.yandex.net/iam/v1/tokens';
const IAM_SA_URL = 'https://iam.api.cloud.yandex.net/iam/v1/serviceAccounts';
const BILLING_URL = 'https://billing.api.cloud.yandex.net/billing/v1';
const RESOURCE_MANAGER_URL = 'https://resource-manager.api.cloud.yandex.net/resource-manager/v1';
const COMPUTE_URL = 'https://compute.api.cloud.yandex.net/compute/v1';
const CDN_URL = 'https://cdn.api.cloud.yandex.net/cdn/v1';
const STORAGE_URL = 'https://storage.api.cloud.yandex.net/storage/v1';

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
 * API (`/instances`), CDN resources from the CDN API (`/resources`) and Object Storage buckets from
 * the Storage API (`/buckets`), scanning every folder of the service account's cloud the key can
 * see (at least its own folder). All are usage-billed with no price in their APIs, so each
 * resource's "monthly cost" comes from its actual consumption in the Billing Usage API's
 * per-resource report. No maintained npm SDK → thin axios client, like the other connectors.
 * Consumption history comes from the Billing Usage API, which is gRPC-only — see
 * ./yandex.consumption.ts.
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
    const [instances, cdn, buckets] = await Promise.all([
      this.listPerFolder<YandexInstance>(
        folderIds,
        `${COMPUTE_URL}/instances`,
        'instances',
        signal,
      ),
      this.listPerFolder<YandexCdnResource>(folderIds, `${CDN_URL}/resources`, 'resources', signal),
      this.listPerFolder<YandexBucket>(folderIds, `${STORAGE_URL}/buckets`, 'buckets', signal),
    ]);
    const services = [
      ...instances.map(mapYandexInstance),
      ...cdn.map(mapYandexCdnResource),
      ...buckets.map(mapYandexBucket),
    ];
    await this.attachMonthlyCost(services, signal);
    return services;
  }

  /**
   * Fill in each resource's (server, CDN, bucket) monthly cost and next-billing date. All are
   * usage-billed, so the "monthly cost" is the resource's billable consumption from one
   * per-resource report over the previous and current month (see `monthlyCostByResource`); the
   * next-billing date is the start of the next month (when Yandex closes the current billing
   * period), the same for every resource. Best-effort: a missing billing role or a report error
   * leaves costs unset without failing the sync.
   */
  private async attachMonthlyCost(services: ServiceData[], signal: AbortSignal): Promise<void> {
    if (services.length === 0) return;
    const nextBilling = firstOfNextMonthMsk();
    for (const s of services) s.nextBilling = nextBilling;
    const account = await this.resolveBillingAccount(signal);
    if (!account) return;
    const token = await this.iamToken(signal);
    const now = new Date();
    const monthStart = monthStartMsk(0, now);
    const report = await fetchResourceUsageReport(
      account.id,
      token,
      monthStartMsk(-1, now),
      now,
      signal,
    ).catch(() => null);
    if (!report) return; // best-effort: keep the previous costs and let the sync go on
    const costs = monthlyCostByResource(report.entities, monthStart, monthStartMsk(1, now), now);
    const currency = (report.currency || account.currency || 'RUB').toUpperCase();
    for (const s of services) {
      s.cost = costs.get(s.externalId) ?? new Decimal(0); // nothing billed → zero
      s.currency = currency;
      s.period = 'monthly';
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
   * The scope the connector will actually use: the folders scanned for resources and the billing
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
   * The folders to scan for resources: the service account's own folder (resolved from its
   * `service_account_id` via IAM) plus every other folder of that cloud the key can see. There is
   * no account-wide resource list (each API lists per folder). The cloud's folder list only shows
   * folders the key has a role in, so a key with `viewer` on the folder alone still scans just its
   * home folder, and a failing list falls back to it as well.
   */
  private async resolveFolders(signal: AbortSignal): Promise<{ id: string; name: string }[]> {
    const home = await this.homeFolder(signal);
    if (!home) return [];
    const folders = new Map([[home.id, { id: home.id, name: home.name }]]);
    if (home.cloudId) {
      const listed = await this.paginate<{ id: string; name?: string }>(
        `${RESOURCE_MANAGER_URL}/folders`,
        'folders',
        { cloudId: home.cloudId },
        signal,
      ).catch(() => []);
      for (const f of listed) {
        if (!folders.has(f.id)) folders.set(f.id, { id: f.id, name: f.name || f.id });
      }
    }
    return [...folders.values()];
  }

  /** The service account's own folder (id, name, cloud), read from IAM by its `service_account_id`. */
  private async homeFolder(
    signal: AbortSignal,
  ): Promise<{ id: string; name: string; cloudId?: string } | null> {
    const headers = await this.authHeaders(signal);
    const sa = await this.http.get<{ folderId?: string }>(
      `${IAM_SA_URL}/${this.creds.serviceAccountId}`,
      { headers, signal, validateStatus: (s) => s === 200 || s === 403 || s === 404 },
    );
    const folderId = sa.status === 200 ? sa.data.folderId : undefined;
    if (!folderId) return null;
    const folder = await this.http.get<{ name?: string; cloudId?: string }>(
      `${RESOURCE_MANAGER_URL}/folders/${folderId}`,
      { headers, signal, validateStatus: (s) => s === 200 || s === 403 || s === 404 },
    );
    const data = folder.status === 200 ? folder.data : {};
    return { id: folderId, name: data.name || folderId, cloudId: data.cloudId };
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

  /** Folder ids to scan for resources (the same set surfaced as badges by `discover`). */
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

  /** Collect a per-folder list endpoint across folders; a folder that fails contributes nothing. */
  private async listPerFolder<T>(
    folderIds: string[],
    url: string,
    key: string,
    signal: AbortSignal,
  ): Promise<T[]> {
    const perFolder = await Promise.allSettled(
      folderIds.map((folderId) => this.paginate<T>(url, key, { folderId }, signal)),
    );
    return perFolder.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
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

/** 00:00 MSK on the 1st of the month `delta` months away from the current Moscow month. */
function monthStartMsk(delta: number, now = new Date()): Date {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const start = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth() + delta, 1);
  return new Date(start - MSK_OFFSET_MS);
}

/** Start of next month in Moscow time: when Yandex closes the current billing period. */
function firstOfNextMonthMsk(): Date {
  return monthStartMsk(1);
}
