import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  OPENROUTER_CURRENCY,
  mapOpenRouterActivityPayments,
  mapOpenRouterModelServices,
  type OpenRouterNameOptions,
} from './openrouter.mapper';
import type {
  OpenRouterActivityItem,
  OpenRouterActivityResponse,
  OpenRouterCredentials,
  OpenRouterCreditsResponse,
  OpenRouterModelsResponse,
  OpenRouterSelfKeyResponse,
} from './openrouter.types';
import { parseOpenRouterCredentials } from './openrouter.types';

const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly nameOpts: OpenRouterNameOptions;
  private managementOk?: boolean;
  private cachedActivity?: OpenRouterActivityItem[];
  private cachedNames?: Map<string, string>;

  constructor(creds: OpenRouterCredentials | string) {
    const c = typeof creds === 'string' ? parseOpenRouterCredentials(creds) : creds;
    this.nameOpts = {
      useCatalogNames: c.useCatalogNames !== false,
    };
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${c.token}`,
        'HTTP-Referer': 'https://github.com/sedyh/infra-billing',
        'X-Title': 'infra-billing',
      },
    });
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as
          | { error?: { message?: string } | string; message?: string }
          | undefined;
        const err = body?.error;
        const msg =
          (typeof err === 'object' && err?.message) ||
          (typeof err === 'string' ? err : undefined) ||
          body?.message;
        throw new Error(
          msg ? `OpenRouter: ${msg}` : `OpenRouter API error (HTTP ${e.response?.status})`,
        );
      }
      throw e;
    });
  }

  kind(): string {
    return 'openrouter';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    await this.requireManagementKey(signal);
    const { data } = await this.http.get<OpenRouterCreditsResponse>('/credits', { signal });
    const remaining = new Decimal(String(data.data.total_credits ?? 0)).minus(
      String(data.data.total_usage ?? 0),
    );
    return { balance: remaining, currency: OPENROUTER_CURRENCY };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    await this.requireManagementKey(signal);
    const [rows, names] = await Promise.all([this.activity(signal), this.modelNames(signal)]);
    return mapOpenRouterModelServices(rows, names, this.nameOpts);
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    await this.requireManagementKey(signal);
    const [rows, names] = await Promise.all([this.activity(signal), this.modelNames(signal)]);
    return mapOpenRouterActivityPayments(rows, names, this.nameOpts);
  }

  private async requireManagementKey(signal: AbortSignal): Promise<void> {
    if (this.managementOk) return;
    const { data } = await this.http.get<OpenRouterSelfKeyResponse>('/key', { signal });
    if (data.data?.is_management_key === false) {
      throw new Error(
        'OpenRouter: a Management API key is required (Settings → Management Keys), not a normal API key',
      );
    }
    this.managementOk = true;
  }

  private async activity(signal: AbortSignal): Promise<OpenRouterActivityItem[]> {
    if (this.cachedActivity) return this.cachedActivity;
    const { data } = await this.http.get<OpenRouterActivityResponse>('/activity', { signal });
    this.cachedActivity = data.data ?? [];
    return this.cachedActivity;
  }

  private async modelNames(signal: AbortSignal): Promise<Map<string, string>> {
    if (!this.nameOpts.useCatalogNames) {
      this.cachedNames = new Map();
      return this.cachedNames;
    }
    if (this.cachedNames) return this.cachedNames;
    const map = new Map<string, string>();
    const add = (data?: OpenRouterModelsResponse['data']) => {
      for (const m of data ?? []) {
        if (m.id && m.name) map.set(m.id, m.name);
      }
    };
    await Promise.all(
      ['text', 'embeddings'].map(async (output_modalities) => {
        try {
          const { data } = await this.http.get<OpenRouterModelsResponse>('/models', {
            signal,
            params: { output_modalities },
          });
          add(data.data);
        } catch {
          /* keep slug for that modality */
        }
      }),
    );
    this.cachedNames = map;
    return map;
  }
}
