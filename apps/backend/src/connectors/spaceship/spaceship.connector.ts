import axios, { type AxiosInstance } from 'axios';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, ServiceData } from '../connector.interface';
import { mapSpaceshipDomain } from './spaceship.mapper';
import {
  SpaceshipCredentials,
  SpaceshipDomain,
  SpaceshipDomainsResponse,
  SpaceshipError,
} from './spaceship.types';

const BASE_URL = 'https://spaceship.dev/api/v1';
const PAGE_SIZE = 100; // /domains max `take`
const MAX_PAGES = 50; // safety cap against a misbehaving pagination contract

// Spaceship (domain registrar, https://docs.spaceship.dev): API key + secret via the
// X-API-Key / X-API-Secret headers, no npm SDK -> thin axios client.
// Services: GET /domains (take/skip pagination) -> yearly `domain` services renewing on
// `expirationDate`. The API exposes no balance, no billing ledger and no renewal pricing
// (SellerHub/SafePay is the aftermarket, not billing), so balance is null and cost stays unset.
export class SpaceshipConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(creds: SpaceshipCredentials) {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'X-API-Key': creds.apiKey, 'X-API-Secret': creds.apiSecret },
    });
    // Surface Spaceship's structured error ({ detail }) instead of a bare HTTP status.
    this.http.interceptors.response.use(undefined, (e) => {
      if (axios.isAxiosError(e)) {
        const body = e.response?.data as SpaceshipError | undefined;
        if (body?.detail) throw new Error(`Spaceship: ${body.detail}`);
      }
      throw e;
    });
  }

  kind(): string {
    return 'spaceship';
  }

  async fetchAccount(_signal: AbortSignal): Promise<Account> {
    return { balance: null, currency: 'USD' };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const domains: SpaceshipDomain[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await this.http.get<SpaceshipDomainsResponse>('/domains', {
        params: { take: PAGE_SIZE, skip: page * PAGE_SIZE },
        signal,
      });
      const batch = data?.items ?? [];
      domains.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    return domains.map(mapSpaceshipDomain);
  }
}
