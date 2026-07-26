import Decimal from 'decimal.js';
import type { Period } from '@infra/shared';
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
    (typeof s.location === 'object' && s.location
      ? (s.location.name ?? s.location.code)
      : null);
  if (!raw) return undefined;
  const key = String(raw).trim().toLowerCase();
  if (LOCATION_COUNTRY[key]) return LOCATION_COUNTRY[key];
  const prefix = key.split(/[-_\s]/)[0];
  if (prefix && LOCATION_COUNTRY[prefix]) return LOCATION_COUNTRY[prefix];
  if (/^[a-z]{2}$/i.test(key)) return key.toUpperCase();
  return undefined;
}

function mapPeriod(period?: string): Period {
  const p = (period ?? 'monthly').toLowerCase();
  if (p.includes('year') || p === 'annually' || p === 'yearly') return 'yearly';
  if (p.includes('quarter') || p === 'quarterly') return 'quarterly';
  if (p.includes('6') || p.includes('semi') || p === 'semiannually') return 'quarterly';
  if (p.includes('day') || p === 'daily') return 'daily';
  if (p.includes('hour') || p === 'hourly') return 'hourly';
  return 'monthly';
}

export function mapHostkeyServer(s: HostkeyServer, currency: string, nextBilling: Date): ServiceData {
  const rate = s.prebill_rate != null ? Number(s.prebill_rate) : NaN;
  const period = mapPeriod(s.prebill_period);
  const typeRaw = (s.type ?? '').toLowerCase();
  return {
    externalId: String(s.id),
    name: s.hostname || s.name || `hostkey-${s.id}`,
    type: typeRaw.includes('server') || typeRaw.includes('dedicated') ? 'dedicated' : 'vps',
    countryCode: locationCode(s),
    cost: Number.isFinite(rate) ? new Decimal(rate) : undefined,
    currency,
    period,
    nextBilling,
    meta: { ...s },
  };
}
