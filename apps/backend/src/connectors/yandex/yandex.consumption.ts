import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import {
  ResourceUsageReportEntityData,
  ResourceUsageReportResponse,
  UsageReportPeriodicData,
  UsageReportResponse,
} from './yandex.types';

// The Billing Usage API is gRPC-only (no REST counterpart), so this module wraps a thin gRPC
// client around a trimmed proto (see ./proto/consumption.proto). It is kept apart from the axios
// connector so the gRPC dependency stays contained to the one call that needs it.
const BILLING_GRPC_ENDPOINT = 'billing.api.cloud.yandex.net:443';
const PROTO_PATH = path.join(__dirname, 'proto', 'consumption.proto');
// The report is served at most once per minute per IP; keep a generous deadline.
const CALL_DEADLINE_MS = 60_000;

interface UsageReportRequestMessage {
  billingAccountId: string;
  startDate: { seconds: number; nanos: number };
  endDate: { seconds: number; nanos: number };
  aggregationPeriod: string;
}

interface ConsumptionClient extends grpc.Client {
  GetBillingAccountUsageReport(
    req: UsageReportRequestMessage,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (err: grpc.ServiceError | null, resp: UsageReportResponse) => void,
  ): grpc.ClientUnaryCall;
  GetResourceUsageReport(
    req: UsageReportRequestMessage,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (err: grpc.ServiceError | null, resp: ResourceUsageReportResponse) => void,
  ): grpc.ClientUnaryCall;
}

type ConsumptionClientCtor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
) => ConsumptionClient;

let cachedCtor: ConsumptionClientCtor | null = null;

function consumptionClientCtor(): ConsumptionClientCtor {
  if (cachedCtor) return cachedCtor;
  const def = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const pkg = grpc.loadPackageDefinition(def) as unknown as {
    yandex: {
      cloud: {
        billing: {
          usage_records: { v1: { ConsumptionCoreService: ConsumptionClientCtor } };
        };
      };
    };
  };
  cachedCtor = pkg.yandex.cloud.billing.usage_records.v1.ConsumptionCoreService;
  return cachedCtor;
}

/** gRPC status codes we translate into actionable messages; the rest surface verbatim. */
function reportError(err: grpc.ServiceError): Error {
  if (err.code === grpc.status.PERMISSION_DENIED) {
    return new Error(
      'Yandex Cloud: no permission to read consumption. Assign the service account the ' +
        'billing.accounts.getReport permission (role billing.accounts.viewer or higher) on the billing account.',
    );
  }
  if (err.code === grpc.status.RESOURCE_EXHAUSTED) {
    return new Error(
      'Yandex Cloud: consumption report rate limit reached (1 request/minute) — try later',
    );
  }
  return new Error(`Yandex Cloud: consumption report failed — ${err.details || err.message}`);
}

/**
 * Pull the billing account's daily consumption for [start, end] via the gRPC Billing Usage API.
 * Returns the per-day time series (one point per calendar day); the caller maps it to charges.
 */
export async function fetchUsageReport(
  billingAccountId: string,
  iamToken: string,
  start: Date,
  end: Date,
  signal: AbortSignal,
): Promise<{ currency?: string; periodic: UsageReportPeriodicData[] }> {
  const Ctor = consumptionClientCtor();
  const client = new Ctor(BILLING_GRPC_ENDPOINT, grpc.credentials.createSsl());
  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${iamToken}`);

  try {
    const resp = await new Promise<UsageReportResponse>((resolve, reject) => {
      const call = client.GetBillingAccountUsageReport(
        {
          billingAccountId,
          startDate: { seconds: Math.floor(start.getTime() / 1000), nanos: 0 },
          endDate: { seconds: Math.floor(end.getTime() / 1000), nanos: 0 },
          aggregationPeriod: 'DAY',
        },
        metadata,
        { deadline: Date.now() + CALL_DEADLINE_MS },
        (err, value) => (err ? reject(reportError(err)) : resolve(value)),
      );
      // Abort the in-flight call if the surrounding sync is cancelled.
      signal.addEventListener('abort', () => call.cancel(), { once: true });
    });
    return { currency: resp.currency, periodic: resp.entitiesData?.[0]?.periodic ?? [] };
  } finally {
    client.close();
  }
}

/**
 * Monthly consumption of every resource on the billing account over [start, end], in one call. The
 * per-resource report breaks costs down by resource id, so all services are priced at once instead
 * of spending the once-a-minute report limit on each of them.
 */
export async function fetchResourceUsageReport(
  billingAccountId: string,
  iamToken: string,
  start: Date,
  end: Date,
  signal: AbortSignal,
): Promise<{ currency?: string; entities: ResourceUsageReportEntityData[] }> {
  const Ctor = consumptionClientCtor();
  const client = new Ctor(BILLING_GRPC_ENDPOINT, grpc.credentials.createSsl());
  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${iamToken}`);

  try {
    const resp = await new Promise<ResourceUsageReportResponse>((resolve, reject) => {
      const call = client.GetResourceUsageReport(
        {
          billingAccountId,
          startDate: { seconds: Math.floor(start.getTime() / 1000), nanos: 0 },
          endDate: { seconds: Math.floor(end.getTime() / 1000), nanos: 0 },
          aggregationPeriod: 'MONTH',
        },
        metadata,
        { deadline: Date.now() + CALL_DEADLINE_MS },
        (err, value) => (err ? reject(reportError(err)) : resolve(value)),
      );
      signal.addEventListener('abort', () => call.cancel(), { once: true });
    });
    return { currency: resp.currency, entities: resp.entitiesData ?? [] };
  } finally {
    client.close();
  }
}
