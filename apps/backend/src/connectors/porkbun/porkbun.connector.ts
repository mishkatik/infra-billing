import axios, { type AxiosInstance } from 'axios';
import Decimal from 'decimal.js';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, ServiceData } from '../connector.interface';
import { isLivePorkbunDomain, mapPorkbunDomain, porkbunTld } from './porkbun.mapper';
import {
  BalanceResponse,
  ListAllResponse,
  PorkbunCredentials,
  PorkbunDomain,
  PorkbunResponse,
  PricingResponse,
} from './porkbun.types';

const BASE_URL = 'https://api.porkbun.com/api/json/v3';
const PAGE_SIZE = 1000; // /domain/listAll returns up to 1000 per call

/**
 * Porkbun (domain registrar) connector. Auth: API key + secret via the X-API-Key / X-Secret-API-Key
 * headers. Balance from /account/balance (cents → USD); domains from /domain/listAll; the yearly
 * renewal price per TLD from the public /pricing/get; expired domains Porkbun moved off ACTIVE
 * (e.g. AUCTION) are skipped. No payment-history endpoint exists. No npm SDK is published → thin
 * axios client. Every response is wrapped in { status: "SUCCESS" | "ERROR" }.
 */
export class PorkbunConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(creds: PorkbunCredentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'X-API-Key': creds.apiKey, 'X-Secret-API-Key': creds.secretApiKey },
    });
  }

  kind(): string {
    return 'porkbun';
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    const { data } = await this.http.get<BalanceResponse>('/account/balance', { signal });
    assertOk(data);
    // `balance` is the account credit in cents.
    return { balance: new Decimal(data.balance ?? 0).div(100), currency: 'USD' };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const domains: PorkbunDomain[] = [];
    // `start` is a zero-based offset; advance by the page size until a short page is returned.
    for (let start = 0; ; start += PAGE_SIZE) {
      const { data } = await this.http.get<ListAllResponse>('/domain/listAll', {
        params: { start },
        signal,
      });
      assertOk(data);
      const batch = data.domains ?? [];
      domains.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    // Domains already gone from the account are left out, so the sync deactivates them.
    const live = domains.filter((d) => isLivePorkbunDomain(d));
    const renewal = await this.fetchRenewalPrices(live, signal);
    return live.map((d) => mapPorkbunDomain(d, renewal));
  }

  /**
   * TLD → yearly renewal price (USD), requested for only the TLDs we own. The unfiltered
   * /pricing/get returns ~900 TLDs (~80 KB) and is slow enough to blow the request timeout, which
   * would leave every domain without a price. Best-effort: on failure cost stays unset (owner edits).
   */
  private async fetchRenewalPrices(
    domains: PorkbunDomain[],
    signal: AbortSignal,
  ): Promise<Map<string, Decimal>> {
    const out = new Map<string, Decimal>();
    const tlds = [...new Set(domains.map(porkbunTld).filter(Boolean))];
    if (tlds.length === 0) return out;
    try {
      const { data } = await this.http.post<PricingResponse>('/pricing/get', { tlds }, { signal });
      for (const [tld, p] of Object.entries(data.pricing ?? {})) {
        if (p.renewal && /^\d+(\.\d+)?$/.test(p.renewal)) {
          out.set(tld.toLowerCase(), new Decimal(p.renewal));
        }
      }
    } catch {
      // pricing is best-effort: leave cost unset, the owner can edit it
    }
    return out;
  }
}

/** Porkbun returns 200 with { status: "ERROR", message } on failure → surface a readable error. */
function assertOk(data: PorkbunResponse): void {
  if (data?.status !== 'SUCCESS') {
    throw new Error(`Porkbun: ${data?.message || data?.status || 'request failed'}`);
  }
}
