import { Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  aggregateConsumptionByDay,
  bucketKopecks,
  consumptionByContainer,
  consumptionByResource,
  costWindow,
  coveredDays,
  foldSwiftContainers,
  mapSelectelBucket,
  mapSelectelRouter,
  mapSelectelServer,
  MSK_OFFSET_MS,
  perDay,
  s3Regions,
  SelectelBucket,
} from './selectel.mapper';
import {
  BalancesResponse,
  CatalogEntry,
  ConsumptionRow,
  KeystoneAuth,
  NeutronRouter,
  NovaServer,
  SelectelCredentials,
  SwiftContainer,
} from './selectel.types';

const IDENTITY_URL = 'https://cloud.api.selcloud.ru/identity/v3/auth/tokens';
const API_BASE = 'https://api.selectel.ru';

// Selectel exposes no top-up/transaction API, but the Billing Statistics API returns per-object
// consumption (charges). These are the valid provider keys it accepts.
const PROVIDER_KEYS = [
  'vpc',
  'serverless',
  'mks',
  'dbaas',
  'storage',
  'cdn',
  'vmware',
  'craas',
  'ones',
  'private_storage',
  'mobfarm',
  'ses',
  'inference',
  'netdisk',
];
// How many months of consumption history to import.
const CONSUMPTION_MONTHS = 3;
// Cloud resources are billed by the hour, so a service's cost is its average daily consumption
// over this many full days: long enough to smooth out traffic spikes, short enough to follow a
// growing bucket or a resized server.
const COST_WINDOW_DAYS = 7;

// The Billing Statistics API takes naive datetimes ("YYYY-MM-DDTHH:mm:ss", no zone).
const naive = (d: Date) => d.toISOString().slice(0, 19);
// Shifts an instant so that `naive` prints it as Moscow wall-clock time, which the API expects.
const moscowClock = (d: Date) => new Date(d.getTime() + MSK_OFFSET_MS);

/** Public endpoints of a catalog service, one per region, without a trailing slash. */
function publicEndpoints(catalog: CatalogEntry[], type: string) {
  const service = catalog.find((s) => s.type === type);
  return (service?.endpoints ?? [])
    .filter((e) => e.interface === 'public' && e.url)
    .map((e) => ({ region: e.region ?? '', url: (e.url as string).replace(/\/+$/, '') }));
}

/**
 * Selectel connector (https://docs.selectel.ru/en/api/). No maintained npm SDK (official is Go
 * `go-selvpcclient`), so a thin axios client. Auth is Keystone v3 (token in the `X-Subject-Token`
 * response header). Balance and consumption use an account-scoped token; cloud servers (Nova
 * `compute`), routers (Neutron `network`) and S3 buckets (Swift `object-store`) use a
 * project-scoped token and the endpoints from its service catalog, so listing them requires
 * `projectName` (the Cloud project). None of these APIs has a price: every service's cost is its
 * average daily consumption from the Billing Statistics API.
 */
export class SelectelConnector implements Connector {
  private readonly logger = new Logger(SelectelConnector.name);
  private readonly http: AxiosInstance;
  private readonly creds: SelectelCredentials;
  private accountToken: string | null = null;
  private projectAuth: KeystoneAuth | null = null;

  constructor(creds: SelectelCredentials) {
    this.creds = creds;
    this.http = axios.create({ timeout: REQUEST_TIMEOUT_MS });
  }

  kind(): string {
    return 'selectel';
  }

  /** Keystone v3 auth for a given scope; returns the token, service catalog and project id. */
  private async keystone(
    scope: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<KeystoneAuth> {
    const body = {
      auth: {
        identity: {
          methods: ['password'],
          password: {
            user: {
              name: this.creds.username,
              domain: { name: this.creds.accountId },
              password: this.creds.password,
            },
          },
        },
        scope,
      },
    };
    const res = await axios.post<{
      token?: { catalog?: CatalogEntry[]; project?: { id?: string } };
    }>(IDENTITY_URL, body, {
      timeout: REQUEST_TIMEOUT_MS,
      signal,
      validateStatus: () => true,
    });
    if (res.status === 401)
      throw new Error('Selectel: invalid username, password or account number');
    if (res.status === 403) {
      throw new Error(
        'Selectel: the service user has no access to the project — assign it a role in the project.',
      );
    }
    if (res.status >= 400) throw new Error(`Selectel: authorization failed (HTTP ${res.status})`);
    const token = res.headers['x-subject-token'];
    if (!token) throw new Error('Selectel: token was not obtained (no X-Subject-Token header)');
    return {
      token: String(token),
      catalog: res.data?.token?.catalog ?? [],
      projectId: res.data?.token?.project?.id,
    };
  }

  private async accountScopedToken(signal: AbortSignal): Promise<string> {
    if (this.accountToken) return this.accountToken;
    const { token } = await this.keystone({ domain: { name: this.creds.accountId } }, signal);
    this.accountToken = token;
    return token;
  }

  private async projectScoped(signal: AbortSignal): Promise<KeystoneAuth> {
    if (this.projectAuth) return this.projectAuth;
    this.projectAuth = await this.keystone(
      { project: { name: this.creds.projectName, domain: { name: this.creds.accountId } } },
      signal,
    );
    return this.projectAuth;
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const headers = { 'X-Auth-Token': await this.accountScopedToken(signal) };
    let data: BalancesResponse;
    try {
      ({ data } = await this.http.get<BalancesResponse>(`${API_BASE}/v3/balances`, {
        headers,
        signal,
      }));
    } catch (e) {
      // The Keystone token works, but the service user may lack a billing role → 403.
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        throw new Error(
          'Selectel: the service user has no billing permissions. Assign it the "Viewer" ' +
            'role (balance, consumption and S3 buckets) or "Account Administrator" in User ' +
            'Management; "Billing" alone does not list buckets.',
        );
      }
      throw e;
    }
    const finalSum = data?.data?.billings?.[0]?.final_sum;
    // Sums are in kopecks (1/100 RUB); currency comes back lowercase ("rub") → normalize to ISO.
    return {
      balance: finalSum != null ? new Decimal(finalSum).div(100) : new Decimal(0),
      currency: (data?.data?.settings?.currency || 'RUB').toUpperCase(),
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    // Cloud resources belong to a project; without one we have nothing to list.
    if (!this.creds.projectName) return [];
    const auth = await this.projectScoped(signal);
    const [servers, routers, { buckets, failures }] = await Promise.all([
      this.listServers(auth, signal),
      this.listRouters(auth, signal),
      this.listBuckets(auth, signal),
    ]);
    if (servers.length + routers.length + buckets.length + failures.length === 0) return [];

    // One consumption request prices everything: servers and routers by object id (a server's
    // disks and public IPs point to it via parent_id), buckets by region and container name.
    const window = costWindow(COST_WINDOW_DAYS);
    const rows = await this.costRows(window, signal);
    const projectId = auth.projectId ?? '';

    // A storage region that failed to list fails the sync where the project pays for S3 (or when
    // that is unknown): skipping it would mark its buckets inactive. Other regions are skipped:
    // some catalog hosts don't resolve from every network, and nothing of ours lives there.
    const paidS3 = rows && projectId ? s3Regions(rows, projectId) : null;
    const blocking = failures.find((f) => !paidS3 || paidS3.has(f.region));
    if (blocking)
      throw new Error(`Selectel: object storage ${blocking.region}: ${blocking.reason}`);

    const byResource = rows ? consumptionByResource(rows) : null;
    const byContainer = rows && projectId ? consumptionByContainer(rows, projectId) : null;
    const cost = (id: string, created?: string) =>
      byResource
        ? perDay(byResource.get(id), coveredDays(created, window.start, window.end))
        : undefined;

    return [
      ...servers.map(({ server, region }) =>
        mapSelectelServer(server, region, cost(String(server.id), server.created)),
      ),
      ...routers.map(({ router, region }) =>
        mapSelectelRouter(router, region, cost(String(router.id), router.created_at)),
      ),
      // Swift reports no creation date, so a bucket is always averaged over the whole window.
      ...buckets.map((b) =>
        mapSelectelBucket(
          b,
          projectId,
          byContainer ? perDay(bucketKopecks(b, byContainer), COST_WINDOW_DAYS) : undefined,
        ),
      ),
    ];
  }

  private async listServers(
    auth: KeystoneAuth,
    signal: AbortSignal,
  ): Promise<Array<{ server: NovaServer; region: string }>> {
    // Servers can live in any region the project uses; query each compute endpoint and aggregate.
    const perRegion = await Promise.allSettled(
      publicEndpoints(auth.catalog, 'compute').map(async ({ region, url }) => {
        const { data } = await this.http.get<{ servers?: NovaServer[] }>(`${url}/servers/detail`, {
          headers: { 'X-Auth-Token': auth.token },
          signal,
        });
        return (data?.servers ?? []).map((server) => ({ server, region }));
      }),
    );
    return perRegion.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  }

  /** Routers are paid for on their own (not through a server); listed like servers. */
  private async listRouters(
    auth: KeystoneAuth,
    signal: AbortSignal,
  ): Promise<Array<{ router: NeutronRouter; region: string }>> {
    const perRegion = await Promise.allSettled(
      publicEndpoints(auth.catalog, 'network').map(async ({ region, url }) => {
        const { data } = await this.http.get<{ routers?: NeutronRouter[] }>(`${url}/v2.0/routers`, {
          headers: { 'X-Auth-Token': auth.token },
          signal,
        });
        return (data?.routers ?? []).map((router) => ({ router, region }));
      }),
    );
    return perRegion.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  }

  /**
   * S3 buckets through the Swift API, the documented way to list them with a project token: one
   * listing per region of the `object-store` catalog entry. 403/404 mean S3 isn't enabled for the
   * project in that region. Other failures are returned, not thrown: fetchServices checks them
   * against the regions the project pays S3 in.
   */
  private async listBuckets(
    auth: KeystoneAuth,
    signal: AbortSignal,
  ): Promise<{ buckets: SelectelBucket[]; failures: Array<{ region: string; reason: string }> }> {
    const failures: Array<{ region: string; reason: string }> = [];
    const perRegion = await Promise.all(
      publicEndpoints(auth.catalog, 'object-store').map(async ({ region, url }) => {
        try {
          const res = await this.http.get<SwiftContainer[]>(`${url}?format=json`, {
            headers: { 'X-Auth-Token': auth.token },
            signal,
            validateStatus: (s) => s === 200 || s === 204 || s === 403 || s === 404,
          });
          if (res.status !== 200) return [];
          if (!Array.isArray(res.data)) throw new Error('unexpected listing response');
          return foldSwiftContainers(res.data, region);
        } catch (e) {
          failures.push({ region, reason: e instanceof Error ? e.message : String(e) });
          return [];
        }
      }),
    );
    return { buckets: perRegion.flat(), failures };
  }

  /**
   * Consumption of every product over the cost window, or null when it can't be read (e.g. no
   * billing role): services then sync without a cost and keep the one they had.
   * `project_object_region_metric` is missing from the published spec, but the API accepts it
   * (the panel uses it): it keeps the region buckets are matched by and the parent_id that ties
   * disks and IPs to their server.
   */
  private async costRows(
    window: { start: Date; end: Date },
    signal: AbortSignal,
  ): Promise<ConsumptionRow[] | null> {
    try {
      return await this.consumption(
        {
          start: moscowClock(window.start),
          // The end bound includes the hour stamped at it; stop a second short for whole days.
          end: moscowClock(new Date(window.end.getTime() - 1000)),
          providerKeys: PROVIDER_KEYS,
          groupType: 'project_object_region_metric',
          periodGroupType: 'all',
        },
        signal,
      );
    } catch (e) {
      // The sync-wide timeout must still fail the sync rather than pass for a missing cost.
      if (signal.aborted) throw e;
      const reason = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Selectel: consumption unavailable, services keep their cost: ${reason}`);
      return null;
    }
  }

  /**
   * Import consumption (charges) from the Billing Statistics API. Selectel has no top-up/
   * transaction API, but `/v1/cloud_billing/statistic/consumption` returns spend (kopecks) per
   * period; we aggregate to one `charge` per day (see the mapper). Account-scoped (no project).
   */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - CONSUMPTION_MONTHS, 1),
    );
    const rows = await this.consumption(
      {
        start,
        end: now,
        providerKeys: PROVIDER_KEYS,
        groupType: 'project',
        periodGroupType: 'day',
      },
      signal,
    );
    return aggregateConsumptionByDay(rows);
  }

  /** Billing Statistics consumption rows (values in kopecks) for a window. Account-scoped. */
  private async consumption(
    query: {
      start: Date;
      end: Date;
      providerKeys: string[];
      groupType: string;
      periodGroupType: string;
    },
    signal: AbortSignal,
  ): Promise<ConsumptionRow[]> {
    const headers = { 'X-Auth-Token': await this.accountScopedToken(signal) };
    const params = new URLSearchParams({
      start: naive(query.start),
      end: naive(query.end),
      locale: 'ru',
      group_type: query.groupType,
      period_group_type: query.periodGroupType,
    });
    for (const k of query.providerKeys) params.append('provider_keys', k);
    const url = `${API_BASE}/v1/cloud_billing/statistic/consumption?${params.toString()}`;
    const { data } = await this.http.get<{ data?: ConsumptionRow[] }>(url, { headers, signal });
    return data?.data ?? [];
  }
}
