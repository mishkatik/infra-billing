import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { mapVibehostDedicated, mapVibehostTransaction, mapVibehostVps } from './vibehost.mapper';
import {
  VibehostAccount,
  VibehostDedicated,
  VibehostTransactionPage,
  VibehostVps,
} from './vibehost.types';

const BASE_URL = 'https://api.vibehost.net';
const TRANSACTIONS_PATH = '/api/v1/billing/transactions';
const TRANSACTIONS_PAGE_SIZE = 100;
const MAX_TRANSACTION_PAGES = 100;

/**
 * VibeHost connector for the public API v1. Authentication uses X-API-Key. The API exposes a
 * prepaid USD balance and separate VPS/dedicated collections; both service types are monthly.
 */
export class VibehostConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'X-API-Key': token },
    });
    this.http.interceptors.response.use(undefined, (error) => {
      if (axios.isAxiosError(error)) {
        const body = error.response?.data as { error?: string; message?: string } | undefined;
        const message = body?.message || body?.error;
        if (message) throw new Error(`VibeHost: ${message}`);
      }
      throw error;
    });
  }

  kind(): string {
    return 'vibehost';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<VibehostAccount>('/api/v1/account', { signal });
    return { balance: new Decimal(String(data.balance ?? 0)), currency: 'USD' };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const [vps, dedicated] = await Promise.all([
      this.http.get<VibehostVps[]>('/api/v1/vps', { signal }),
      this.http.get<VibehostDedicated[]>('/api/v1/dedicated', { signal }),
    ]);

    const activeVps = vps.data.filter((server) => server.lifecycle !== 'DELETED');
    const activeDedicated = dedicated.data.filter(
      (server) => server.lifecycle !== 'DECLINED' && server.status !== 'cancelled',
    );
    return [...activeVps.map(mapVibehostVps), ...activeDedicated.map(mapVibehostDedicated)];
  }

  /**
   * Import the signed balance ledger when VibeHost permits this endpoint for X-API-Key clients.
   * A rejected request is non-fatal because SyncService isolates optional payment-ledger failures.
   */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const payments: PaymentData[] = [];
    for (let page = 0; page < MAX_TRANSACTION_PAGES; page++) {
      const { data } = await this.http.get<VibehostTransactionPage>(TRANSACTIONS_PATH, {
        params: { page, size: TRANSACTIONS_PAGE_SIZE },
        signal,
      });
      payments.push(...(data.content ?? []).map(mapVibehostTransaction));
      if (data.last || data.empty || page + 1 >= data.totalPages) break;
    }
    return payments;
  }
}
