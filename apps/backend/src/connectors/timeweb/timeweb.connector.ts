import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, ServiceData } from '../connector.interface';
import { mapTimewebServer } from './timeweb.mapper';
import {
  FinancesResponse,
  PresetsResponse,
  ServicesCostResponse,
  TimewebPreset,
  TimewebServiceCost,
  TimewebServersResponse,
} from './timeweb.types';

const BASE_URL = 'https://api.timeweb.cloud';

// Timeweb Cloud: no maintained npm SDK, so a thin axios client. Auth: Bearer <API_TOKEN>.
export class TimewebConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  kind(): string {
    return 'timeweb';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<FinancesResponse>('/api/v1/account/finances', { signal });
    return {
      balance: new Decimal(data.finances?.balance ?? 0),
      currency: data.finances?.currency || 'RUB',
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const [serversRes, presets, costs] = await Promise.all([
      this.http.get<TimewebServersResponse>('/api/v1/servers', { signal }),
      this.fetchPresets(signal),
      this.fetchServiceCosts(signal),
    ]);
    return (serversRes.data.servers ?? []).map((s) => mapTimewebServer(s, presets, costs));
  }

  /**
   * Per-service monthly prices (includes configurator VPS and add-ons via total_cost).
   * Best-effort: empty map on failure so preset fallback can still fill tariff servers.
   */
  private async fetchServiceCosts(signal: AbortSignal): Promise<Map<number, TimewebServiceCost>> {
    try {
      const { data } = await this.http.get<ServicesCostResponse>('/api/v1/account/services/cost', {
        signal,
      });
      const map = new Map<number, TimewebServiceCost>();
      for (const row of data.services_costs ?? []) {
        if (row.type && row.type !== 'server') continue;
        if (typeof row.service_id === 'number') map.set(row.service_id, row);
      }
      return map;
    } catch {
      return new Map();
    }
  }

  /** Server preset tariffs (fallback when services/cost is unavailable). Empty map on failure. */
  private async fetchPresets(signal: AbortSignal): Promise<Map<number, TimewebPreset>> {
    try {
      const { data } = await this.http.get<PresetsResponse>('/api/v1/presets/servers', { signal });
      const map = new Map<number, TimewebPreset>();
      for (const p of data.server_presets ?? []) map.set(p.id, p);
      return map;
    } catch {
      return new Map();
    }
  }
}
