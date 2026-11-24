import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { createHttp, REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { mapVdsinaOperation, mapVdsinaServer } from './vdsina.mapper';
import {
  VDSINA_BASE_URLS,
  VdsinaBalance,
  VdsinaCredentials,
  VdsinaEnvelope,
  VdsinaOperation,
  VdsinaServer,
  VdsinaServerPlan,
} from './vdsina.types';

const DEFAULT_BASE_URL = 'https://userapi.vdsina.ru';

/** Server detail data.{cpu,ram,disk} carry value (plan base) vs total (configured) pairs. */
function isCustomized(server: VdsinaServer): boolean {
  const data = server.data;
  if (!data || typeof data !== 'object') return false;
  return Object.values(data).some(
    (p) =>
      p !== null &&
      typeof p === 'object' &&
      'value' in p &&
      'total' in p &&
      (p as { value?: unknown; total?: unknown }).value !==
        (p as { value?: unknown; total?: unknown }).total,
  );
}

/**
 * VDSina Public API (https://vdsina.ru/tech/api, https://www.vdsina.com/tech/api): JSON over
 * HTTPS, token in the Authorization header. Two branches share one API; `baseUrl` picks the
 * branch and thereby the billing currency (.ru — RUB, .com — USD; the API never reports it).
 * The account balance is the prepaid `real` purse (bonus/partner are not real money), servers
 * are listed via /v1/server, account operations import top-ups/charges. Dates on both branches
 * are Europe/Moscow.
 */
export class VdsinaConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly currency: string;
  private readonly plansByGroup = new Map<number, Promise<VdsinaServerPlan[]>>();

  constructor(creds: VdsinaCredentials) {
    const baseUrl = (creds.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const currency = VDSINA_BASE_URLS[baseUrl];
    // Hard allowlist: anything else would re-send the API token to a foreign host.
    if (!currency) {
      throw new Error(
        'VDSina: baseUrl must be https://userapi.vdsina.ru or https://userapi.vdsina.com',
      );
    }
    this.currency = currency;
    this.http = createHttp({
      baseURL: baseUrl,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: creds.token },
      // The JSON API never legitimately redirects; refuse rather than re-send the token elsewhere.
      maxRedirects: 0,
    });
    this.http.interceptors.response.use(
      (res) => {
        const body = res.data as VdsinaEnvelope<unknown> | undefined;
        if (body?.status === 'error') {
          throw new Error(`VDSina: ${body.description || body.status_msg || 'API error'}`);
        }
        return res;
      },
      (e) => {
        // Never rethrow the AxiosError itself: its config carries the Authorization header,
        // and sync errors end up in logs/DB. Keep only the safe message.
        if (axios.isAxiosError(e)) {
          const body = e.response?.data as VdsinaEnvelope<unknown> | undefined;
          const msg = body?.description || body?.status_msg || e.message;
          throw new Error(`VDSina: ${msg}`);
        }
        throw e;
      },
    );
  }

  kind(): string {
    return 'vdsina';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<VdsinaEnvelope<VdsinaBalance>>('/v1/account.balance', {
      signal,
    });
    return {
      balance: new Decimal(String(data.data?.real ?? 0)),
      currency: this.currency,
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const { data } = await this.http.get<VdsinaEnvelope<VdsinaServer[]>>('/v1/server', { signal });
    const services = (data.data ?? []).filter((s) => s.status !== 'deleted');
    const enriched = await Promise.all(services.map((s) => this.withDetails(s, signal)));
    return enriched.map((s) => mapVdsinaServer(s, this.currency));
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const { data } = await this.http.get<VdsinaEnvelope<VdsinaOperation[]>>('/v1/operation', {
      signal,
    });
    return (data.data ?? [])
      .map((o) => mapVdsinaOperation(o, this.currency))
      .filter((p): p is PaymentData => p !== null);
  }

  /**
   * The list row's server-plan is bare {id, name} — cost/period always require the detail
   * (for server-group) and the group's plan catalog. Best-effort: on failure the list row
   * still yields an unpriced service.
   */
  private async withDetails(server: VdsinaServer, signal: AbortSignal): Promise<VdsinaServer> {
    try {
      const { data } = await this.http.get<VdsinaEnvelope<VdsinaServer>>(
        `/v1/server/${server.id}`,
        { signal },
      );
      const detailed = { ...server, ...data.data };
      return await this.withPlanPrice(detailed, signal);
    } catch {
      return server;
    }
  }

  /** Server detail includes only plan id/name; price/period live in /v1/server-plan/{groupId}. */
  private async withPlanPrice(server: VdsinaServer, signal: AbortSignal): Promise<VdsinaServer> {
    const plan = server['server-plan'];
    if (!plan?.id || plan.cost) return server;
    const group = server['server-group'];
    if (!group?.id) return server;

    const plans = await this.fetchPlans(group.id, signal);
    // Retired plans disappear from the catalog — the service then stays unpriced on purpose.
    const priced = plans.find((p) => p.id === plan.id);
    if (!priced) return server;
    // Constructor plans (has_params) bill base price + configured extras; the catalog price alone
    // underreports a customized server, and a wrong price is worse than a missing one.
    if (priced.has_params && isCustomized(server)) return server;

    return {
      ...server,
      'server-plan': { ...priced, ...plan, cost: priced.cost, period: priced.period },
    };
  }

  private async fetchPlans(groupId: number, signal: AbortSignal): Promise<VdsinaServerPlan[]> {
    let promise = this.plansByGroup.get(groupId);
    if (!promise) {
      promise = this.http
        .get<VdsinaEnvelope<VdsinaServerPlan[]>>(`/v1/server-plan/${groupId}`, { signal })
        .then((res) => res.data.data ?? [])
        .catch(() => []);
      this.plansByGroup.set(groupId, promise);
    }
    return promise;
  }
}
