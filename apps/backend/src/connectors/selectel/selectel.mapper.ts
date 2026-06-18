import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import { ConsumptionRow, NovaServer } from './selectel.types';

// Selectel region prefix → ISO 3166-1 alpha-2.
const REGION_COUNTRY: Record<string, string> = { ru: 'RU', kz: 'KZ', uz: 'UZ', ke: 'KE' };

/** Map a Nova (OpenStack) server to our domain Service. Cloud is usage-billed → cost unset. */
export function mapSelectelServer(s: NovaServer, region: string): ServiceData {
  const az =
    typeof s['OS-EXT-AZ:availability_zone'] === 'string' ? s['OS-EXT-AZ:availability_zone'] : '';
  const prefix = (region || az).split('-')[0]?.toLowerCase() ?? '';
  return {
    externalId: String(s.id),
    name: s.name || `server-${s.id}`,
    type: 'vps',
    countryCode: REGION_COUNTRY[prefix],
    // Cloud servers are usage-billed (no price in the API) → owner sets the cost.
    period: 'monthly',
    // Curated meta — never include `metadata` (it holds the server password hash).
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
