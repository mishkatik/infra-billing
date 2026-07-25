import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import {
  DoubleServersServer,
  DoubleServersServerHistoryItem,
  DoubleServersTopup,
} from './doubleservers.types';

export const DOUBLESERVERS_CURRENCY = 'EUR';

const COUNTRY_BY_NAME: Record<string, string> = {
  germany: 'DE',
  finland: 'FI',
  france: 'FR',
  netherlands: 'NL',
  singapore: 'SG',
  'united states': 'US',
  usa: 'US',
  poland: 'PL',
  sweden: 'SE',
  austria: 'AT',
  switzerland: 'CH',
  'united kingdom': 'GB',
  uk: 'GB',
};

function parseDate(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function mapDoubleServersCountry(
  location?: string | null,
  locationName?: string | null,
): string | undefined {
  const name = (locationName ?? '').split(',')[0]?.trim().toLowerCase();
  if (name && COUNTRY_BY_NAME[name]) return COUNTRY_BY_NAME[name];
  const loc = (location ?? '').toLowerCase();
  if (loc.startsWith('ger') || loc.startsWith('fsn') || loc.startsWith('nbg')) return 'DE';
  if (loc.startsWith('hel')) return 'FI';
  if (loc.startsWith('ash') || loc.startsWith('hil')) return 'US';
  if (loc.startsWith('sin')) return 'SG';
  return undefined;
}

export function mapDoubleServersServer(s: DoubleServersServer): ServiceData {
  return {
    externalId: String(s.id),
    name: s.name || `ds-${s.id}`,
    type: 'vps',
    countryCode: mapDoubleServersCountry(s.location, s.location_name),
    cost: s.price != null ? new Decimal(String(s.price)) : undefined,
    currency: DOUBLESERVERS_CURRENCY,
    period: 'monthly',
    nextBilling: parseDate(s.expires_at),
    meta: {
      ip: s.ip,
      status: s.status,
      frozen: s.frozen,
      blocked: s.blocked,
      autoRenew: s.auto_renew,
      plan: s.plan,
      location: s.location,
      locationName: s.location_name,
      hostProvider: s.provider,
      os: s.os,
      created: s.created_at,
    },
  };
}

export function mapDoubleServersTopup(t: DoubleServersTopup): PaymentData | null {
  const date = parseDate(t.confirmed_at);
  if (!date) return null;
  return {
    externalId: `topup:${t.transaction_id}`,
    type: 'topup',
    amount: new Decimal(String(t.amount_eur)),
    currency: DOUBLESERVERS_CURRENCY,
    date,
    description: t.method ?? undefined,
  };
}

export function mapDoubleServersCharge(
  item: DoubleServersServerHistoryItem,
  serverId: number,
): PaymentData | null {
  if ((item.kind ?? '').toLowerCase() !== 'debit') return null;
  const date = parseDate(item.created_at);
  if (!date) return null;
  const amount = new Decimal(String(item.amount)).abs();
  if (amount.lte(0)) return null;
  return {
    externalId: `charge:${item.id}`,
    type: 'charge',
    amount,
    currency: DOUBLESERVERS_CURRENCY,
    date,
    description: item.description ?? item.type ?? undefined,
    serviceExternalId: String(serverId),
  };
}
