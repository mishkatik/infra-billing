import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import {
  BillingTransaction,
  ConsumptionRow,
  DedicatedPricePlan,
  DedicatedResource,
  NeutronRouter,
  NovaServer,
  SwiftContainer,
} from './selectel.types';

// Selectel region prefix → ISO 3166-1 alpha-2 (gis-* are Moscow pools for government systems).
const REGION_COUNTRY: Record<string, string> = {
  ru: 'RU',
  gis: 'RU',
  kz: 'KZ',
  uz: 'UZ',
  ke: 'KE',
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Billing Statistics product keys of S3; only their rows are matched to buckets by name.
const S3_PROVIDER_KEYS = new Set(['storage', 'private_storage']);

// Dedicated server location name prefix (city code) → ISO 3166-1 alpha-2.
const LOCATION_COUNTRY: Record<string, string> = {
  MSK: 'RU',
  SPB: 'RU',
  NSK: 'RU',
  TAS: 'UZ',
  ALM: 'KZ',
  NBO: 'KE',
};

// Dedicated service types that are servers; colocation, ports, network gear etc. become `other`.
const DEDICATED_SERVER_TYPES = new Set(['serverchip', 'server']);

function countryOf(region: string): string | undefined {
  return REGION_COUNTRY[region.split('-')[0]?.toLowerCase() ?? ''];
}

/**
 * Map a Nova (OpenStack) server to our domain Service. The API has no price: the cost is the
 * server's average daily consumption together with its disks and public IPs.
 */
export function mapSelectelServer(s: NovaServer, region: string, dailyCost?: Decimal): ServiceData {
  const az =
    typeof s['OS-EXT-AZ:availability_zone'] === 'string' ? s['OS-EXT-AZ:availability_zone'] : '';
  return {
    externalId: String(s.id),
    name: s.name || `server-${s.id}`,
    type: 'vps',
    countryCode: countryOf(region || az),
    // Undefined when consumption couldn't be read: the sync then keeps the previous cost.
    cost: dailyCost,
    period: 'daily',
    // Curated meta. Never include `metadata` (it holds the server password hash).
    meta: {
      region,
      az,
      status: s.status,
      created: s.created,
      flavorId: s.flavor?.id,
      imageId: typeof s.image === 'string' ? s.image : s.image?.id,
      addresses: s.addresses,
    },
  };
}

/** Map a Neutron router to our domain Service; billed hourly, so the cost is per day. */
export function mapSelectelRouter(
  r: NeutronRouter,
  region: string,
  dailyCost?: Decimal,
): ServiceData {
  return {
    externalId: String(r.id),
    name: r.name || `router-${r.id}`,
    type: 'other',
    countryCode: countryOf(region),
    cost: dailyCost,
    period: 'daily',
    meta: { kind: 'router', region, status: r.status, created: r.created_at },
  };
}

/**
 * Period and cost of a dedicated price plan. `price` covers the whole plan (`period` months or
 * days); plan lengths we don't model become a pro-rated monthly or daily cost.
 */
export function resolveDedicatedBilling(
  plan: DedicatedPricePlan | null | undefined,
  price: number | null | undefined,
): { period: string; cost: Decimal } | undefined {
  const n = plan?.period ?? 0;
  if (price == null || n < 1) return undefined;
  const amount = new Decimal(String(price));
  if (plan?.type === 'month') {
    if (n === 1) return { period: 'monthly', cost: amount };
    if (n === 3) return { period: 'quarterly', cost: amount };
    if (n === 12) return { period: 'yearly', cost: amount };
    return { period: 'monthly', cost: amount.div(n) };
  }
  if (plan?.type === 'day') return { period: 'daily', cost: amount.div(n) };
  return undefined;
}

/**
 * Map a rented dedicated resource to our domain Service. The price is the next renewal (next
 * plan, with discounts) and the next billing date is the end of the paid period.
 */
export function mapSelectelDedicated(r: DedicatedResource, location?: string): ServiceData {
  const billing = r.billing ?? {};
  const price = billing.price ?? {};
  const resolved = resolveDedicatedBilling(
    billing.next_price_plan ?? billing.current_price_plan,
    price.future_price ?? price.plan_price,
  );
  return {
    externalId: r.uuid,
    name: r.user_desc || r.info || r.uuid,
    type: DEDICATED_SERVER_TYPES.has(r.service_type ?? '') ? 'dedicated' : 'other',
    countryCode: LOCATION_COUNTRY[location?.split('-')[0]?.toUpperCase() ?? ''],
    // Undefined for a plan we can't read: the sync then keeps the previous cost.
    cost: resolved?.cost,
    currency: billing.currency ? billing.currency.toUpperCase() : undefined,
    period: resolved?.period,
    nextBilling: r.paid_till ? new Date(r.paid_till * 1000) : undefined,
    // Curated meta: the resource also lists the whole catalog of add-ons it could order.
    meta: {
      kind: 'dedicated',
      location,
      tariff: r.info,
      config: r.config_name,
      serviceType: r.service_type,
      state: r.state,
      autoRenew: !r.is_not_prolonged,
      created: r.created ? new Date(r.created * 1000).toISOString() : undefined,
    },
  };
}

/**
 * Top-ups and dedicated server charges from the account transactions. Pending and cancelled
 * top-ups are skipped (PRE_PAID is already on the balance), as are holds and their refunds, bonus
 * credits, and the daily cloud charges, which come from consumption with a per-day breakdown.
 */
export function mapSelectelTransactions(rows: BillingTransaction[]): PaymentData[] {
  const out: PaymentData[] = [];
  for (const t of rows) {
    if (t.balance !== 'main' || t.price == null || !t.created) continue;
    const ids = t.id_meta?.id ?? [];
    if (!t.id_meta?.billing || ids.length === 0) continue;
    const base = {
      // A payment keeps its ids when PRE_PAID turns PAID, so the re-sync updates the same row.
      externalId: `sel:txn:${t.id_meta.billing}:${Math.min(...ids)}`,
      amount: new Decimal(Math.abs(t.price)).div(100), // kopecks → RUB
      currency: 'RUB',
      // Naive Moscow wall-clock time → real instant.
      date: new Date(Date.parse(`${t.created}Z`) - MSK_OFFSET_MS),
    };
    const resource = t.server_meta?.main_resource_uuid;
    if (
      t.transaction_group === 'payment' &&
      t.dir === 'incoming' &&
      (t.state === 'PAID' || t.state === 'PRE_PAID')
    ) {
      out.push({
        ...base,
        type: 'topup',
        description: t.description?.ru || t.description?.en || undefined,
      });
    } else if (
      t.transaction_group === 'withdraw' &&
      t.dir === 'outgoing' &&
      t.state === 'PAID' &&
      resource
    ) {
      out.push({
        ...base,
        type: 'charge',
        description: t.id_meta.service_name || undefined,
        serviceExternalId: resource,
      });
    }
  }
  return out;
}

// Hidden containers holding a bucket's upload segments: `_s3multipartuploads` for S3 multipart
// uploads, `_segments` / `.file-segments` for Swift. The panel counts them into the bucket's size.
const SEGMENT_SUFFIXES = ['_s3multipartuploads', '_segments', '.file-segments'];

/** An S3 bucket of one region together with the containers billed for it. */
export interface SelectelBucket {
  region: string;
  name: string;
  containers: string[];
  bytes: number;
  objects: number;
  lastModified?: string;
}

/**
 * Fold a region's Swift listing into buckets: a segment container whose bucket is in the same
 * listing adds its bytes to it (like the panel: size with segments, object count without). An
 * orphaned segment container stays a bucket of its own, since it is still paid for.
 */
export function foldSwiftContainers(list: SwiftContainer[], region: string): SelectelBucket[] {
  const names = new Set(list.map((c) => c.name));
  const rootOf = (name: string): string => {
    for (const suffix of SEGMENT_SUFFIXES) {
      const parent = name.endsWith(suffix) ? name.slice(0, -suffix.length) : '';
      if (parent && names.has(parent)) return rootOf(parent);
    }
    return name;
  };

  const buckets = new Map<string, SelectelBucket>();
  for (const c of list) {
    const root = rootOf(c.name);
    let bucket = buckets.get(root);
    if (!bucket) {
      bucket = { region, name: root, containers: [], bytes: 0, objects: 0 };
      buckets.set(root, bucket);
    }
    bucket.containers.push(c.name);
    bucket.bytes += c.bytes ?? 0;
    if (root === c.name) {
      bucket.objects = c.count ?? 0;
      bucket.lastModified = c.last_modified;
    }
  }
  return [...buckets.values()];
}

/**
 * Sum consumption (kopecks) per resource id. A row counts for its own object and for its parent,
 * so a server's total includes its disks and public IPs (Selectel links them via parent_id).
 */
export function consumptionByResource(rows: ConsumptionRow[]): Map<string, Decimal> {
  const sums = new Map<string, Decimal>();
  const add = (id: string | null | undefined, value: number) => {
    if (id) sums.set(id, (sums.get(id) ?? new Decimal(0)).add(value));
  };
  for (const row of rows) {
    if (row.value == null) continue;
    add(row.object?.id, row.value);
    add(row.object?.parent_id, row.value);
  }
  return sums;
}

/**
 * Sum one project's S3 consumption (kopecks) per `region/container`. The project-wide row for
 * requests made through the panel or the Storage API names no container and matches no bucket.
 */
export function consumptionByContainer(
  rows: ConsumptionRow[],
  projectId: string,
): Map<string, Decimal> {
  const sums = new Map<string, Decimal>();
  for (const row of rows) {
    const name = row.object?.name;
    const region = row.metric?.region;
    if (!S3_PROVIDER_KEYS.has(row.provider_key ?? '') || row.project?.id !== projectId) continue;
    if (!name || !region || row.value == null) continue;
    const key = `${region}/${name}`;
    sums.set(key, (sums.get(key) ?? new Decimal(0)).add(row.value));
  }
  return sums;
}

/** Regions where the project had any S3 consumption, i.e. where it really keeps buckets. */
export function s3Regions(rows: ConsumptionRow[], projectId: string): Set<string> {
  const regions = new Set<string>();
  for (const row of rows) {
    const region = row.metric?.region;
    if (!S3_PROVIDER_KEYS.has(row.provider_key ?? '') || row.project?.id !== projectId) continue;
    if (region) regions.add(region);
  }
  return regions;
}

/** A bucket's consumption (kopecks): its own container plus its segment containers. */
export function bucketKopecks(bucket: SelectelBucket, byContainer: Map<string, Decimal>): Decimal {
  let total = new Decimal(0);
  for (const c of bucket.containers) {
    total = total.add(byContainer.get(`${bucket.region}/${c}`) ?? 0);
  }
  return total;
}

// The Billing Statistics API reads and labels its naive datetimes in Moscow time (UTC+3, no DST):
// a server created at 00:46Z has its first hour billed under "04:00".
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The last `days` full Moscow days before `now`, as real instants [start, end). */
export function costWindow(days: number, now = new Date()): { start: Date; end: Date } {
  const moscow = new Date(now.getTime() + MSK_OFFSET_MS);
  moscow.setUTCHours(0, 0, 0, 0);
  const end = new Date(moscow.getTime() - MSK_OFFSET_MS);
  return { start: new Date(end.getTime() - days * DAY_MS), end };
}

/**
 * Days of the cost window [start, end) a resource existed: one created inside the window is
 * averaged over its own lifetime rather than read as idle for the days before it.
 */
export function coveredDays(created: string | undefined, start: Date, end: Date): number {
  const since = Math.max(start.getTime(), Date.parse(created ?? '') || 0);
  return Math.max(0, (end.getTime() - since) / DAY_MS);
}

/** Average daily cost of `kopecks` spent over `days`; zero when the resource wasn't there yet. */
export function perDay(kopecks: Decimal | undefined, days: number): Decimal {
  return days > 0 ? (kopecks ?? new Decimal(0)).div(days).div(100) : new Decimal(0);
}

/** Map an S3 bucket to our domain Service. S3 is pay-as-you-go, so the cost is per day. */
export function mapSelectelBucket(
  bucket: SelectelBucket,
  projectId: string,
  dailyCost?: Decimal,
): ServiceData {
  return {
    externalId: `bucket:${projectId}:${bucket.region}:${bucket.name}`,
    name: bucket.name,
    type: 'storage',
    countryCode: countryOf(bucket.region),
    // Undefined when consumption couldn't be read: the sync then keeps the previous cost.
    cost: dailyCost,
    period: 'daily',
    meta: {
      region: bucket.region,
      bytes: bucket.bytes,
      objects: bucket.objects,
      lastModified: bucket.lastModified,
    },
  };
}

/**
 * Aggregate Billing Statistics consumption rows (kopecks) into ONE `charge` per calendar day,
 * summing every object/project. Idempotent across re-syncs via the per-day externalId.
 */
export function aggregateConsumptionByDay(rows: ConsumptionRow[]): PaymentData[] {
  const perDay = new Map<string, Decimal>();
  for (const row of rows) {
    const day = (row.period ?? '').slice(0, 10); // YYYY-MM-DD
    if (row.value == null || !day) continue;
    perDay.set(day, (perDay.get(day) ?? new Decimal(0)).add(row.value));
  }

  const out: PaymentData[] = [];
  for (const [day, value] of perDay) {
    if (value.lte(0)) continue;
    out.push({
      externalId: `sel:day:${day}`, // one charge per day; idempotent across re-syncs
      type: 'charge',
      amount: value.div(100), // kopecks → RUB
      currency: 'RUB',
      date: new Date(`${day}T00:00:00Z`),
      description: 'Selectel consumption',
    });
  }
  return out;
}
