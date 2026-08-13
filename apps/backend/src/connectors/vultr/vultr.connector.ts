import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { VULTR_CURRENCY, mapVultrInstance, mapVultrPayment } from './vultr.mapper';
import {
  VultrAccountResponse,
  VultrBillingItem,
  VultrBillingResponse,
  VultrError,
  VultrInstance,
  VultrInstancesResponse,
  VultrPaged,
  VultrPlan,
  VultrPlansResponse,
  VultrRegion,
  VultrRegionsResponse,
} from './vultr.types';

const BASE_URL = 'https://api.vultr.com/v2';
const PER_PAGE = 500;
const MAX_PAGES = 50; // safety cap so a misbehaving cursor contract can't loop forever

// Vultr v2 (https://api.vultr.com/v2): no npm SDK -> thin axios client, Bearer <API key>, money USD.
// Balance: GET /account (wrapped in `account`, negative = credit -> normalised, see fetchAccount).
// Services: /instances priced via
// /plans (`monthly_cost`). Payments: /billing/history rows -> topup/charge. Cursor pagination via
// `meta.links.next`. Key may be IP-allowlisted (Access Control) -> off-list IP gives 403 (surfaced).
export class VultrConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token}` },
    });
    // Surface Vultr's structured error (e.g. an IP not on the key's allowlist) even on 4xx.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as VultrError | undefined;
        if (body?.error) throw new Error(`Vultr: ${body.error}`);
      }
      throw e;
    });
  }

  kind(): string {
    return 'vultr';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<VultrAccountResponse>('/account', { signal });
    // Prepaid: Vultr reports `balance` from its own ledger (negative = credit held by the customer)
    // and bills `pending_charges` for the current period out of that credit. Mirror the console's
    // "Remaining Credit" so stored credit is positive, consistent with the other connectors
    // (cf. Linode, where the same sign flip is applied).
    const credit = new Decimal(String(data.account?.balance ?? 0)).neg();
    const pendingCharges = new Decimal(String(data.account?.pending_charges ?? 0));
    return { balance: credit.minus(pendingCharges), currency: VULTR_CURRENCY };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const [instances, plans, regions] = await Promise.all([
      this.paginate<VultrInstance, VultrInstancesResponse>(
        '/instances',
        (d) => d.instances,
        signal,
      ),
      this.fetchPlans(signal),
      this.fetchRegions(signal),
    ]);
    return instances.map((i) => mapVultrInstance(i, plans, regions));
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const items = await this.paginate<VultrBillingItem, VultrBillingResponse>(
      '/billing/history',
      (d) => d.billing_history,
      signal,
    );
    return items.map(mapVultrPayment);
  }

  /** Build an id→plan map for pricing. Best-effort: if /plans fails, instances are left unpriced. */
  private async fetchPlans(signal: AbortSignal): Promise<Map<string, VultrPlan>> {
    try {
      const plans = await this.paginate<VultrPlan, VultrPlansResponse>(
        '/plans',
        (d) => d.plans,
        signal,
      );
      return new Map(plans.map((p) => [p.id, p]));
    } catch {
      return new Map();
    }
  }

  /**
   * Build a region-code → ISO-2 country map (e.g. "sto" → "SE"). Vultr instances carry only the
   * region code, so /regions is the only source of country. Best-effort: if it fails, country is
   * left unset (the owner can fill it in).
   */
  private async fetchRegions(signal: AbortSignal): Promise<Map<string, string>> {
    try {
      const regions = await this.paginate<VultrRegion, VultrRegionsResponse>(
        '/regions',
        (d) => d.regions,
        signal,
      );
      return new Map(regions.filter((r) => r.country).map((r) => [r.id, r.country]));
    } catch {
      return new Map();
    }
  }

  /** Walk Vultr v2 cursor pages (`meta.links.next`), accumulating the rows picked from each page. */
  private async paginate<T, R extends VultrPaged>(
    path: string,
    pick: (d: R) => T[] | undefined,
    signal: AbortSignal,
  ): Promise<T[]> {
    const out: T[] = [];
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await this.http.get<R>(path, {
        params: { per_page: PER_PAGE, ...(cursor ? { cursor } : {}) },
        signal,
      });
      out.push(...(pick(data) ?? []));
      cursor = data?.meta?.links?.next || '';
      if (!cursor) break;
    }
    return out;
  }
}
