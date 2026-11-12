import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import { REQUEST_TIMEOUT_MS } from '../common/http';
import { Account, Connector, PaymentData, ServiceData } from '../connector.interface';
import {
  DATAPACKET_FALLBACK_CURRENCY,
  mapDatapacketInvoice,
  mapDatapacketSubscription,
} from './datapacket.mapper';
import {
  datapacketInvoiceSchema,
  datapacketPageSchema,
  datapacketSubscriptionSchema,
} from './datapacket.types';

const ENDPOINT = 'https://api.datapacket.com/v0/graphql';
const PAGE_SIZE = 50; // API maximum
const MAX_PAGES = 100; // safety cap so a broken pagination contract can't loop forever

const SUBSCRIPTIONS_QUERY = `query Subscriptions($input: PaginatedSubscriptionsInput) {
  subscriptions(input: $input) {
    isLastPage
    nextPageIndex
    entries {
      name
      type
      currency
      billingCycle { unit quantity start }
      subscriptionItems {
        description
        price
        currency
        type
        subscriptionItemDetail {
          server {
            name
            alias
            hostname
            deviceType
            statusV2
            location { name identifier }
          }
        }
      }
    }
  }
}`;

const CURRENCY_QUERY = `query Currency {
  subscriptions(input: { pageIndex: 0, pageSize: 1 }) { entries { currency } }
}`;

const PAID_INVOICES_QUERY = `query PaidInvoices($input: PaginatedInvoicesInput) {
  invoices(input: $input) {
    isLastPage
    nextPageIndex
    entries {
      invoiceNumber
      total
      currency
      createdAt
      payment { status paidOn method }
    }
  }
}`;

const errorsSchema = z.array(
  z.object({
    message: z.string().optional(),
    extensions: z.object({ code: z.string().optional() }).passthrough().optional(),
  }),
);

/**
 * DataPacket GraphQL API (https://api.datapacket.com/v0/graphql), `Authorization: Bearer <token>`
 * (a read-only API key from the client panel's Security page is enough). 5000 req/h per user.
 * No account balance in the API → balance null. Services come from subscriptions (servers with
 * their price + per-subscription extras); payments are paid invoices.
 */
export class DatapacketConnector implements Connector {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = axios.create({
      baseURL: ENDPOINT,
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
    });
  }

  kind(): string {
    return 'datapacket';
  }

  /** POST one GraphQL operation; GraphQL errors arrive with HTTP 200 and are thrown here. */
  private async query(
    query: string,
    variables: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    let body: unknown;
    try {
      ({ data: body } = await this.http.post('', { query, variables }, { signal }));
    } catch (error) {
      // Axios errors carry the request config (Authorization header): never pass them to logs.
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (axios.isAxiosError(error) && error.response?.data) {
        const gql = errorsSchema.safeParse((error.response.data as { errors?: unknown }).errors);
        if (gql.success && gql.data.length) throw graphqlError(gql.data);
      }
      throw new Error(`DataPacket: API request failed${status ? ` (HTTP ${status})` : ''}`);
    }
    const envelope = body as { data?: unknown; errors?: unknown } | null;
    const gql = errorsSchema.safeParse(envelope?.errors);
    if (gql.success && gql.data.length) throw graphqlError(gql.data);
    if (!envelope?.data || typeof envelope.data !== 'object') {
      throw new Error('DataPacket: empty API response');
    }
    return envelope.data as Record<string, unknown>;
  }

  /** Walk a paginated list query (pageIndex/nextPageIndex) and validate every entry. */
  private async paginate<T extends z.ZodTypeAny>(
    query: string,
    field: string,
    entry: T,
    filter: Record<string, unknown> | undefined,
    signal: AbortSignal,
  ): Promise<z.infer<T>[]> {
    const pageSchema = datapacketPageSchema(entry);
    const out: z.infer<T>[] = [];
    let pageIndex = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const input = { pageIndex, pageSize: PAGE_SIZE, ...(filter ? { filter } : {}) };
      const data = await this.query(query, { input }, signal);
      const page = pageSchema.safeParse(data[field]);
      if (!page.success) throw new Error(`DataPacket: invalid ${field} response`);
      out.push(...page.data.entries);
      if (page.data.isLastPage || page.data.nextPageIndex == null) return out;
      if (page.data.nextPageIndex <= pageIndex) throw new Error(`DataPacket: bad ${field} paging`);
      pageIndex = page.data.nextPageIndex;
    }
    throw new Error(`DataPacket: ${field} pagination limit exceeded`);
  }

  async fetchAccount(signal: AbortSignal): Promise<Account> {
    // No balance in the API. The first subscription's currency doubles as a token check.
    const data = await this.query(CURRENCY_QUERY, {}, signal);
    const parsed = z
      .object({ entries: z.array(datapacketSubscriptionSchema.pick({ currency: true })) })
      .safeParse(data.subscriptions);
    if (!parsed.success) throw new Error('DataPacket: invalid subscriptions response');
    return {
      balance: null,
      currency: parsed.data.entries[0]?.currency ?? DATAPACKET_FALLBACK_CURRENCY,
    };
  }

  async fetchServices(signal: AbortSignal): Promise<ServiceData[]> {
    const subs = await this.paginate(
      SUBSCRIPTIONS_QUERY,
      'subscriptions',
      datapacketSubscriptionSchema,
      undefined,
      signal,
    );
    const now = new Date();
    return subs.flatMap((sub) => mapDatapacketSubscription(sub, now));
  }

  async fetchPayments(signal: AbortSignal): Promise<PaymentData[]> {
    const invoices = await this.paginate(
      PAID_INVOICES_QUERY,
      'invoices',
      datapacketInvoiceSchema,
      { paymentStatus_in: ['PAID'] },
      signal,
    );
    return invoices.map(mapDatapacketInvoice).filter((p): p is PaymentData => p !== null);
  }
}

function graphqlError(errors: z.infer<typeof errorsSchema>): Error {
  const [first] = errors;
  const code = first.extensions?.code;
  return new Error(`DataPacket: ${code ? `${code}: ` : ''}${first.message ?? 'GraphQL error'}`);
}
