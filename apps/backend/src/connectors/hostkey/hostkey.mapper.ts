import Decimal from 'decimal.js';
import { ServiceData } from '../connector.interface';
import { HostkeyServer } from './hostkey.types';

const LOCATION_COUNTRY: Record<string, string> = {
  ru: 'RU',
  nl: 'NL',
  us: 'US',
  'us-east': 'US',
  'us-west': 'US',
  de: 'DE',
  fi: 'FI',
  is: 'IS',
  tr: 'TR',
  kz: 'KZ',
};

function locationCode(s: HostkeyServer): string | undefined {
  const raw =
    (typeof s.location === 'string' ? s.location : null) ??
    s.location_name ??
    s.short_location ??
    (typeof s.location === 'object' && s.location ? (s.location.name ?? s.location.code) : null);
  if (!raw) return undefined;
  const key = String(raw).trim().toLowerCase();
  if (LOCATION_COUNTRY[key]) return LOCATION_COUNTRY[key];
  const prefix = key.split(/[-_\s]/)[0];
  if (prefix && LOCATION_COUNTRY[prefix]) return LOCATION_COUNTRY[prefix];
  if (/^[a-z]{2}$/i.test(key)) return key.toUpperCase();
  return undefined;
}

function mapPeriod(period?: string): string {
  const p = (period ?? 'monthly').toLowerCase();
  if (p.includes('year') || p === 'annually' || p === 'yearly') return 'yearly';
  if (p.includes('quarter') || p === 'quarterly') return 'quarterly';
  if (p.includes('6') || p.includes('semi') || p === 'semiannually') return 'quarterly';
  if (p.includes('day') || p === 'daily') return 'daily';
  if (p.includes('hour') || p === 'hourly') return 'hourly';
  return 'monthly';
}

function pickCost(s: HostkeyServer, currency: string): number | undefined {
  const prebill = s.prebill_rate != null ? Number(s.prebill_rate) : NaN;
  if (Number.isFinite(prebill)) return prebill;
  const c = currency.toUpperCase();
  const byCurrency =
    c === 'RUB' || c === 'RUR'
      ? Number(s.price_RUR)
      : c === 'USD'
        ? Number(s.price_USD)
        : Number(s.price_EUR);
  if (Number.isFinite(byCurrency) && byCurrency > 0) return byCurrency;
  for (const n of [Number(s.price_RUR), Number(s.price_EUR), Number(s.price_USD)]) {
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function parseDueDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return undefined;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function mapHostkeyServer(
  s: HostkeyServer,
  currency: string,
  fallbackNextBilling: Date,
): ServiceData {
  const cost = pickCost(s, currency);
  const typeRaw = (s.type ?? '').toLowerCase();
  const dedicated = typeRaw.includes('server') || typeRaw.includes('dedicated');
  return {
    externalId: String(s.id),
    name: s.hostname || s.name || s.IP || `hostkey-${s.id}`,
    type: dedicated ? 'dedicated' : 'vps',
    countryCode: locationCode(s),
    cost: cost != null ? new Decimal(cost) : undefined,
    currency,
    period: mapPeriod(s.prebill_period),
    nextBilling: parseDueDate(s.due_date) ?? fallbackNextBilling,
    meta: { ...s },
  };
}
