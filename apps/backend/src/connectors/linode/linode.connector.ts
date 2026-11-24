import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { createHttp, REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  LINODE_CURRENCY,
  mapLinodeInstance,
  mapLinodeInvoice,
  mapLinodePayment,
} from './linode.mapper';
import {
  LinodeAccount,
  LinodeInstance,
  LinodeInvoice,
  LinodePaged,
  LinodePayment,
  LinodeRegion,
  LinodeType,
} from './linode.types';

const BASE_URL = 'https://api.linode.com/v4';
const PAGE_SIZE = 500; // Linode's max page_size
const MAX_PAGES = 50; // safety cap against a misbehaving pagination contract

/**
 * Linode (Akamai Cloud) connector. Auth: Personal Access Token → Authorization: Bearer; money is
 * USD. Servers from /linode/instances, priced via /linode/types (region_prices override the base
 * monthly price), country via /regions. Linode is postpaid: /account `balance` is the amount OWED
 * (negative = credit), so we store the negated value as the net position. Billing: /account/payments
 * (money paid → topup) and /account/invoices (charges). Official @linode/api-v4 SDK is ESM /
 * Cloud-Manager-oriented → thin axios client, like the other connectors.
 */
export class LinodeConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = createHttp({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token}` },
    });
    // Surface Linode's structured error ({ errors: [{ reason }] }) instead of a bare HTTP status.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as { errors?: Array<{ reason?: string }> } | undefined;
        const reason = body?.errors?.[0]?.reason;
        if (reason) throw new Error(`Linode: ${reason}`);
      }
      throw e;
    });
  }

  kind(): string {
    return 'linode';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<LinodeAccount>('/account', { signal });
    // Postpaid: Linode `balance` is owed (negative = credit). Store the net position so credit is
    // positive (consistent with prepaid providers) and money owed shows as a negative balance.
    return { balance: new Decimal(String(data.balance ?? 0)).neg(), currency: LINODE_CURRENCY };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const [instances, priceByType, countryByRegion] = await Promise.all([
      this.paginate<LinodeInstance>('/linode/instances', signal),
      this.fetchTypes(signal),
      this.fetchRegions(signal),
    ]);
    return instances.map((i) => mapLinodeInstance(i, priceByType, countryByRegion));
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    // Two independent ledgers; import each best-effort so one failing doesn't drop the other.
    const [payments, invoices] = await Promise.all([
      this.safe(() => this.paginate<LinodePayment>('/account/payments', signal)),
      this.safe(() => this.paginate<LinodeInvoice>('/account/invoices', signal)),
    ]);
    return [...payments.map(mapLinodePayment), ...invoices.map(mapLinodeInvoice)];
  }

  /** id→type map for pricing. Best-effort: if /linode/types fails, instances are left unpriced. */
  private async fetchTypes(signal: AbortSignal): Promise<Map<string, LinodeType>> {
    const types = await this.safe(() => this.paginate<LinodeType>('/linode/types', signal));
    return new Map(types.map((t) => [t.id, t]));
  }

  /** region id → ISO-2 country map. Best-effort: if /regions fails, country is left unset. */
  private async fetchRegions(signal: AbortSignal): Promise<Map<string, string>> {
    const regions = await this.safe(() => this.paginate<LinodeRegion>('/regions', signal));
    return new Map(regions.filter((r) => r.country).map((r) => [r.id, r.country]));
  }

  private async safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch {
      return [];
    }
  }

  /** Walk Linode's page/pages pagination, accumulating `data` from every page. */
  private async paginate<T>(path: string, signal: AbortSignal): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data } = await this.http.get<LinodePaged<T>>(path, {
        params: { page, page_size: PAGE_SIZE },
        signal,
      });
      out.push(...(data.data ?? []));
      if (!data.pages || page >= data.pages) break;
    }
    return out;
  }
}
