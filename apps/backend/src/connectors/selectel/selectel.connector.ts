import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { aggregateConsumptionByDay, mapSelectelServer } from './selectel.mapper';
import {
  BalancesResponse,
  CatalogEntry,
  ConsumptionRow,
  KeystoneAuth,
  NovaServer,
  SelectelCredentials,
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

/**
 * Selectel connector (https://docs.selectel.ru/en/api/). No maintained npm SDK (official is Go
 * `go-selvpcclient`), so a thin axios client. Auth is Keystone v3 (token in the `X-Subject-Token`
 * response header). Balance uses an account-scoped token (`GET /v3/balances`, kopecks); cloud
 * servers use a project-scoped token + the Nova `compute` endpoint discovered from the service
 * catalog. Cloud is usage-billed, so server cost is left for the owner to set. Listing servers
 * requires `projectName` (the Cloud project).
 */
export class SelectelConnector implements Connector {
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

  /** Keystone v3 auth for a given scope; returns the token + service catalog. */
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
    const res = await axios.post<{ token?: { catalog?: CatalogEntry[] } }>(IDENTITY_URL, body, {
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
    return { token: String(token), catalog: res.data?.token?.catalog ?? [] };
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
          'Selectel: the service user has no billing permissions. Assign it a role ' +
            '("Account Administrator", "Billing" or "Viewer") in User Management.',
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
    // Cloud (OpenStack) servers need a project; without one we have nothing to list.
    if (!this.creds.projectName) return [];
    const { token, catalog } = await this.projectScoped(signal);
    const compute = catalog.find((s) => s.type === 'compute');
    const endpoints = (compute?.endpoints ?? [])
      .filter((e) => e.interface === 'public' && e.url)
      .map((e) => ({ region: e.region ?? '', url: (e.url as string).replace(/\/+$/, '') }));

    // Servers can live in any region the project uses; query each compute endpoint and aggregate.
    const perRegion = await Promise.allSettled(
      endpoints.map(async ({ region, url }) => {
        const { data } = await this.http.get<{ servers?: NovaServer[] }>(`${url}/servers/detail`, {
          headers: { 'X-Auth-Token': token },
          signal,
        });
        return (data?.servers ?? []).map((s) => mapSelectelServer(s, region));
      }),
    );
    return perRegion.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  }

  /**
   * Import consumption (charges) from the Billing Statistics API. Selectel has no top-up/
   * transaction API, but `/v1/cloud_billing/statistic/consumption` returns spend (kopecks) per
   * period; we aggregate to one `charge` per day (see the mapper). Account-scoped (no project).
   */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const headers = { 'X-Auth-Token': await this.accountScopedToken(signal) };
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - CONSUMPTION_MONTHS, 1),
    );
    const naive = (d: Date) => d.toISOString().slice(0, 19); // "YYYY-MM-DDTHH:mm:ss" (no Z)
    const params = new URLSearchParams({
      start: naive(start),
      end: naive(now),
      locale: 'ru',
      group_type: 'project',
      period_group_type: 'day',
    });
    for (const k of PROVIDER_KEYS) params.append('provider_keys', k);
    const url = `${API_BASE}/v1/cloud_billing/statistic/consumption?${params.toString()}`;
    const { data } = await this.http.get<{ data?: ConsumptionRow[] }>(url, { headers, signal });
    return aggregateConsumptionByDay(data?.data ?? []);
  }
}
