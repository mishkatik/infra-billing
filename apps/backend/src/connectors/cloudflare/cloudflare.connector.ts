import axios, { type AxiosInstance } from 'axios';
import { createHttp, REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import { CLOUDFLARE_CURRENCY, mapCfBilling, mapCfDomain } from './cloudflare.mapper';
import { CfBillingItem, CfDomain, CfEnvelope, CloudflareCredentials } from './cloudflare.types';

const BASE_URL = 'https://api.cloudflare.com/client/v4';
const PER_PAGE = 50;

/**
 * Cloudflare connector, public REST API (https://api.cloudflare.com/client/v4). Auth: Bearer token
 * with Registrar: Domains:Read (registrar) + Billing:Read (billing). Both
 * endpoints are account-scoped. Currency is USD. There is no account balance (postpay via Stripe),
 * so fetchAccount returns balance:null (like Hetzner). The Registrar API does not return domain
 * prices → services have no cost (owner fills them in). The Billing API is deprecated (since 2023,
 * no announced sunset) → fetchPayments is best-effort and returns [] on any error.
 */
export class CloudflareConnector implements Connector {
  private readonly http: AxiosInstance;
  private readonly acct: string;

  constructor(creds: CloudflareCredentials) {
    this.acct = creds.accountId;
    this.http = createHttp({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${creds.apiToken}` },
    });
  }

  kind(): string {
    return 'cloudflare';
  }

  // Cloudflare Registrar has no balance (invoices go through Stripe).
  async fetchAccount(): Promise<Account> {
    return { balance: null, currency: CLOUDFLARE_CURRENCY };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const domains = await this.paginate<CfDomain>(
      `/accounts/${this.acct}/registrar/domains`,
      signal,
    );
    return domains.map(mapCfDomain);
  }

  /** DEPRECATED billing API, best-effort. Any error (including a future shutdown) → []. */
  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    try {
      const items = await this.paginate<CfBillingItem>(
        `/accounts/${this.acct}/billing/history`,
        signal,
      );
      return items.map(mapCfBilling).filter((p): p is PaymentData => p !== null);
    } catch {
      // billing/history is deprecated with no replacement. Never break the service sync over it
      return [];
    }
  }

  /** CF pagination: registrar uses result_info.total_pages, billing uses result_info.next_page. */
  private async paginate<T>(path: string, signal: AbortSignal): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    for (;;) {
      // CF rejects an explicit page=1 on an empty list ("Page bigger than the number of pages"),
      // so only send the page param from the second page onward.
      const params: Record<string, number> = { per_page: PER_PAGE };
      if (page > 1) params.page = page;
      let data: CfEnvelope<T[]>;
      try {
        ({ data } = await this.http.get<CfEnvelope<T[]>>(path, { params, signal }));
      } catch (e) {
        throw cfError(e);
      }
      if (!data?.success) throw cfErrorFromBody(data?.errors);
      out.push(...(data.result ?? []));
      const info = data.result_info;
      const more =
        info?.next_page === true ||
        (typeof info?.total_pages === 'number' && page < info.total_pages);
      if (!more) break;
      page += 1;
    }
    return out;
  }
}

interface CfError {
  code?: number;
  message?: string;
}

/** Build a readable Error from CF's { errors:[{code,message}] } body, with a hint for bad ids. */
function cfErrorFromBody(errors?: unknown): Error {
  const list = Array.isArray(errors) ? (errors as CfError[]) : [];
  const msgs = list
    .map((er) => er?.message)
    .filter(Boolean)
    .join('; ');
  // 7003/7000 = "could not route … object identifier invalid". Almost always a wrong Account ID.
  const badId = list.some((er) => er?.code === 7003 || er?.code === 7000);
  const hint = badId ? ' (check the Cloudflare Account ID)' : '';
  return new Error(`Cloudflare: ${msgs || 'request failed'}${hint}`);
}

/** Turn an axios failure into a CF-aware Error so lastSyncError shows the real reason, not a status code. */
function cfError(e: unknown): Error {
  if (axios.isAxiosError(e)) {
    const body = e.response?.data as { errors?: unknown } | undefined;
    if (body?.errors) return cfErrorFromBody(body.errors);
    if (e.response?.status === 401 || e.response?.status === 403) {
      return new Error(
        'Cloudflare: invalid token or missing permissions (Registrar: Domains:Read + Billing:Read)',
      );
    }
  }
  return e instanceof Error ? e : new Error(String(e));
}
