import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { NETLEN_CURRENCY, mapNetlenServer, mapNetlenTransaction } from './netlen.mapper';
import {
  NetlenBalance,
  NetlenEnvelope,
  NetlenListResponse,
  NetlenServer,
  NetlenTransaction,
} from './netlen.types';

const BASE_URL = 'https://api.netlen.com.tr/v1';
const PER_PAGE = 100;
const MAX_PAGES = 50; // safety cap so a misbehaving pagination contract can't loop forever

/**
 * Netlen connector (https://api.netlen.com.tr/v1) — verified live. No npm SDK, so a thin axios
 * client. Auth: a custom `X-API-Key` header (NOT Bearer). Every response is `{ success, data }`
 * (or `{ success:false, error, code }`). Money is USD. Balance is `/balance`; servers (monthly
 * `amount`) come from `/servers`; the `/balance/transactions` deposit/withdraw ledger maps to
 * topup/charge payments. The API key is IP-whitelisted in the panel — an un-whitelisted key fails
 * with code `NO_IP_WHITELISTED`, which we surface as the sync error.
 */
export class NetlenConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'X-API-Key': token },
    });
    // Surface the API's structured error (e.g. INVALID_API_KEY / NO_IP_WHITELISTED) even on 4xx.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as NetlenEnvelope<unknown> | undefined;
        if (body?.error) throw new Error(`Netlen: ${body.error}`);
      }
      throw e;
    });
  }

  kind(): string {
    return 'netlen';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<NetlenEnvelope<NetlenBalance>>('/balance', { signal });
    const balance = assertOk(data);
    return { balance: new Decimal(balance.balance ?? 0), currency: NETLEN_CURRENCY };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const servers = await this.fetchPaged<NetlenServer>('/servers', signal);
    return servers.map(mapNetlenServer);
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const txns = await this.fetchPaged<NetlenTransaction>('/balance/transactions', signal);
    return txns.map(mapNetlenTransaction).filter((p): p is PaymentData => p !== null);
  }

  /** Walk Netlen's `{ data, pagination.has_next }` pages, accumulating the `data` rows. */
  private async fetchPaged<T>(path: string, signal: AbortSignal): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data } = await this.http.get<NetlenListResponse<T>>(path, {
        params: { page, per_page: PER_PAGE },
        signal,
      });
      out.push(...assertOk(data));
      if (!data.pagination?.has_next) break;
    }
    return out;
  }
}

/** Throw on `{ success:false, error }`; otherwise return the `data` payload. */
function assertOk<T>(res: NetlenEnvelope<T>): T {
  if (!res?.success) throw new Error(`Netlen: ${res?.error || 'request rejected'}`);
  return (res.data ?? ([] as unknown as T)) as T;
}
