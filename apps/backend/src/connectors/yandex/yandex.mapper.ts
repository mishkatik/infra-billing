import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import { UsageReportPeriodicData, YandexInstance } from './yandex.types';

// Yandex Cloud zones map to a country by their region prefix. Compute is usage-billed, so cost is
// filled in later by the connector from the per-resource Billing Usage report, not here.
function countryForZone(zoneId?: string): string | undefined {
  if (!zoneId) return undefined;
  if (zoneId.startsWith('ru')) return 'RU';
  if (zoneId.startsWith('kz')) return 'KZ';
  return undefined;
}

// `memory` comes back as a byte count string; expose GiB for readability, leaving raw bytes too.
function memoryGib(memory?: string): number | undefined {
  if (!memory) return undefined;
  const bytes = Number(memory);
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
      memoryGib: memoryGib(i.resources?.memory),
    },
  };
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
    const day = new Date(seconds * 1000).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const amount = new Decimal(p.expense?.value || '0');
    if (amount.lte(0)) continue;
    out.push({
      externalId: `yc:day:${day}`, // one charge per day; idempotent across re-syncs
      type: 'charge',
      amount,
      currency,
      date: new Date(`${day}T00:00:00Z`),
      description: 'Yandex Cloud consumption',
    });
  }
  return out;
}
