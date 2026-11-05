import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import {
  ResourceUsageReportEntityData,
  UsageReportPeriodicData,
  YandexBucket,
  YandexCdnResource,
  YandexInstance,
} from './yandex.types';

// Yandex Cloud bills in Moscow time (UTC+3, no DST): report periods start at 00:00 MSK, i.e.
// 21:00 UTC of the previous calendar day.
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

// Yandex Cloud zones map to a country by their region prefix. Compute is usage-billed, so cost is
// filled in later by the connector from the per-resource Billing Usage report, not here.
function countryForZone(zoneId?: string): string | undefined {
  if (!zoneId) return undefined;
  if (zoneId.startsWith('ru')) return 'RU';
  if (zoneId.startsWith('kz')) return 'KZ';
  return undefined;
}

// Sizes come back as byte count strings; expose GiB for readability.
function bytesToGib(size?: string): number | undefined {
  if (!size) return undefined;
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return undefined;
  return Math.round((bytes / 1024 ** 3) * 100) / 100;
}

export function mapYandexInstance(i: YandexInstance): ServiceData {
  return {
    externalId: i.id,
    name: i.name || `yc-${i.id}`,
    type: 'vps',
    countryCode: countryForZone(i.zoneId),
    period: 'monthly',
    meta: {
      folderId: i.folderId,
      zoneId: i.zoneId,
      platformId: i.platformId,
      status: i.status,
      cores: i.resources?.cores,
      coreFraction: i.resources?.coreFraction,
      memoryGib: bytesToGib(i.resources?.memory),
    },
  };
}

// CDN is served from Yandex's edge network, so there is no single country to attach.
export function mapYandexCdnResource(r: YandexCdnResource): ServiceData {
  return {
    externalId: r.id,
    name: r.cname || `cdn-${r.id}`,
    type: 'cdn',
    period: 'monthly',
    meta: {
      folderId: r.folderId,
      active: r.active,
      providerType: r.providerType,
      originGroupName: r.originGroupName,
      originProtocol: r.originProtocol,
      secondaryHostnames: r.secondaryHostnames,
    },
  };
}

// The management Storage API serves the ru-central1 region only (Kazakhstan lives on separate hosts
// this connector never calls), so every bucket it lists is in Russia.
export function mapYandexBucket(b: YandexBucket): ServiceData {
  return {
    externalId: b.name, // billing reports a bucket's usage under its name
    name: b.name,
    type: 'storage',
    countryCode: 'RU',
    period: 'monthly',
    meta: {
      folderId: b.folderId,
      storageClass: b.defaultStorageClass,
      versioning: b.versioning,
      maxSizeGib: bytesToGib(b.maxSize),
      publicRead: b.anonymousAccessFlags?.read,
    },
  };
}

/**
 * Each resource's monthly cost from the per-resource report (MONTH points over the previous and the
 * current month). Last full month's `expense` wins; a resource with nothing billed then (new, or
 * covered by a grant) gets the current month so far stretched to the whole month. Elapsed time is
 * floored at a day so the first hours of a month don't get multiplied by ~700.
 */
export function monthlyCostByResource(
  entities: ResourceUsageReportEntityData[],
  monthStart: Date,
  monthEnd: Date,
  now: Date,
): Map<string, Decimal> {
  const sums = new Map<string, { previous: Decimal; current: Decimal }>();
  for (const e of entities) {
    const id = e.resource?.id;
    if (!id) continue;
    const sum = sums.get(id) ?? { previous: new Decimal(0), current: new Decimal(0) };
    for (const p of e.periodic ?? []) {
      const seconds = Number(p.timestamp?.seconds ?? NaN);
      if (!Number.isFinite(seconds)) continue;
      const amount = new Decimal(p.expense?.value || '0');
      if (seconds * 1000 < monthStart.getTime()) sum.previous = sum.previous.plus(amount);
      else sum.current = sum.current.plus(amount);
    }
    sums.set(id, sum);
  }
  const monthMs = monthEnd.getTime() - monthStart.getTime();
  const elapsedMs = Math.max(now.getTime() - monthStart.getTime(), DAY_MS);
  const out = new Map<string, Decimal>();
  for (const [id, { previous, current }] of sums) {
    out.set(id, previous.gt(0) ? previous : current.mul(monthMs).div(elapsedMs));
  }
  return out;
}

/**
 * Turn the Billing Usage API's daily time series into one `charge` per calendar day. We record
 * `expense` (the final billable amount after grants/credits), i.e. the money that actually leaves
 * the balance — days fully covered by a grant have expense 0 and are skipped. Idempotent across
 * re-syncs via the per-day externalId.
 */
export function aggregateUsageByDay(
  periodic: UsageReportPeriodicData[],
  currency: string,
): PaymentData[] {
  const out: PaymentData[] = [];
  for (const p of periodic) {
    const seconds = Number(p.timestamp?.seconds ?? NaN);
    if (!Number.isFinite(seconds)) continue;
    // The period starts at 00:00 MSK, so its own calendar day is the Moscow date.
    const day = new Date(seconds * 1000 + MSK_OFFSET_MS).toISOString().slice(0, 10);
    // Keys were first issued from the UTC date of the period start (a day early) and are already
    // stored; keeping them lets re-syncs correct the date in place instead of duplicating charges.
    const key = new Date(seconds * 1000).toISOString().slice(0, 10);
    const amount = new Decimal(p.expense?.value || '0');
    if (amount.lte(0)) continue;
    out.push({
      externalId: `yc:day:${key}`, // one charge per day; idempotent across re-syncs
      type: 'charge',
      amount,
      currency,
      date: new Date(`${day}T00:00:00Z`),
      description: 'Yandex Cloud consumption',
    });
  }
  return out;
}
