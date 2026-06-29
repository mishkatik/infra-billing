import Decimal from 'decimal.js';
import { ServiceData } from '../connector.interface';
import { BegetCloudService, BegetVps } from './beget.types';

// Beget is Russia-based and bills in rubles; no money field carries a currency code (verified live).
export const BEGET_CURRENCY = 'RUB';

// Beget bills every assigned IPv4 — including the VPS's primary one — separately, at a flat monthly
export const BEGET_IP_MONTHLY_RUB = 150;

/** Count of distinct assigned IPv4s (primary ∪ additional). A VPS with no IP returns 0. */
export function begetIpCount(v: BegetVps): number {
  const ips = new Set<string>();
  if (v.ip_address) ips.add(v.ip_address);
  for (const ip of v.additional_ip_address ?? []) if (ip) ips.add(ip);
  return ips.size;
}

/**
 * Region id ("ru1", "kz1") → ISO2 country. Prefers the authoritative /v1/vps/region map; falls
 * back to the 2-letter region prefix (ru1→RU), which holds for Beget's region ids.
 */
export function regionCountry(
  region: string | undefined,
  regions: Map<string, string>,
): string | undefined {
  if (!region) return undefined;
  const mapped = regions.get(region);
  if (mapped) return mapped.toUpperCase();
  const m = /^([a-z]{2})\d/i.exec(region);
  return m ? m[1].toUpperCase() : undefined;
}

/** Map a Beget cloud Service `type` enum to our service type. */
export function begetCloudType(type: string | undefined): string {
  const t = (type ?? '').toUpperCase();
  if (t.includes('MYSQL') || t.includes('POSTGRE')) return 'db';
  if (t.includes('CDN')) return 'cdn';
  if (t.includes('S_3') || t.includes('S3') || t.includes('NETWORK_DRIVE')) return 'storage';
  return 'other';
}

/**
 * Map a Beget VPS (GET /v1/vps/server/list) to our domain Service. `configuration.price_month` is
 * the VPS tariff in RUB; each assigned IPv4 is billed on top (see BEGET_IP_MONTHLY_RUB), so the
 * service cost is tariff + IPs. The API exposes no next-billing/expiry date (only date_create), so
 * `nextBilling` is left unset for the owner to fill.
 */
export function mapBegetVps(v: BegetVps, regions: Map<string, string>): ServiceData {
  const cfg = v.configuration ?? {};
  const ipCount = begetIpCount(v);
  // Tariff + per-IP surcharge. Leave cost unset only when the tariff price is missing (custom plans).
  const cost =
    cfg.price_month != null
      ? new Decimal(cfg.price_month).add(new Decimal(BEGET_IP_MONTHLY_RUB).mul(ipCount))
      : undefined;
  return {
    externalId: `vps:${v.id}`,
    name: v.display_name || v.slug || v.hostname || `vps-${v.id}`,
    type: 'vps',
    countryCode: regionCountry(v.region, regions),
    cost,
    currency: BEGET_CURRENCY,
    period: 'monthly',
    meta: {
      slug: v.slug,
      hostname: v.hostname,
      status: v.status,
      region: v.region,
      ip: v.ip_address,
      ipCount,
      configuration: cfg.name,
      group: cfg.group,
      cpu: cfg.cpu_count,
      memoryMb: cfg.memory,
      diskMb: cfg.disk_size,
      priceDay: cfg.price_day,
      os: v.software?.display_name ?? v.software?.name,
      osVersion: v.software?.version,
      created: v.date_create,
    },
  };
}

/**
 * Map a Beget cloud Service (GET /v1/cloud: managed DB / S3 / CDN / Network Drive) to our Service.
 * S3 is usage-billed, so `price_month` may be 0/absent → cost left unset (owner edits). No expiry
 * field in the API → `nextBilling` left unset.
 */
export function mapBegetCloudService(
  s: BegetCloudService,
  regions: Map<string, string>,
): ServiceData {
  const price = s.price_month;
  return {
    externalId: `cloud:${s.id}`,
    name: s.display_name || s.slug || `service-${s.id}`,
    type: begetCloudType(s.type),
    countryCode: regionCountry(s.region, regions),
    cost: price != null && price > 0 ? new Decimal(price) : undefined,
    currency: BEGET_CURRENCY,
    period: 'monthly',
    meta: {
      begetType: s.type,
      status: s.status,
      region: s.region,
      slug: s.slug,
      priceDay: s.price_day,
    },
  };
}
