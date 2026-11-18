import Decimal from 'decimal.js';
import { fallbackPaymentId } from '@common/ledger-identity';
import { PaymentData, ServiceData } from '../connector.interface';
import { NodehostBillingEntry, NodehostServer } from './nodehost.types';

export const NODEHOST_CURRENCY = 'USD';

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * `price` is the monthly price of the server with the location markup and the account discount
 * applied. Servers are prepaid up to `expiresAt` and are not renewed automatically unless
 * `autoRenew` is set, so `expiresAt` is the next charge date.
 */
export function mapNodehostServer(
  s: NodehostServer,
  countries: Map<string, string>,
  currency: string,
): ServiceData {
  return {
    externalId: s.id,
    name: s.name || s.id,
    type: 'vps',
    countryCode: s.location ? countries.get(s.location.toLowerCase()) : undefined,
    cost: s.price != null ? new Decimal(s.price) : undefined,
    currency,
    period: 'monthly',
    nextBilling: parseDate(s.expiresAt),
    // Explicit allowlist: the API also returns the root password and the access ports.
    meta: {
      type: s.type ?? null,
      status: s.status ?? null,
      ip: s.ip ?? null,
      cores: s.cores ?? null,
      ramGb: s.ram ?? null,
      diskGb: s.disk ?? null,
      diskType: s.diskType ?? null,
      os: s.os ?? null,
      location: s.location ?? null,
      autoRenew: s.autoRenew ?? null,
      createdAt: s.createdAt ?? null,
    },
  };
}

export function mapNodehostBillingEntry(e: NodehostBillingEntry): PaymentData | null {
  const date = new Date(e.at);
  const amount = new Decimal(e.amount).abs();
  if (amount.isZero()) return null;
  const type = e.type === 'topup' ? 'topup' : 'charge';
  const currency = NODEHOST_CURRENCY;
  const ref = e.type === 'topup' ? e.ref : e.serverId && `${e.serverId}:${date.toISOString()}`;
  return {
    externalId: ref
      ? `${type}:${ref}`
      : fallbackPaymentId({ type, currency, paymentDate: date, amount }),
    type,
    amount,
    currency,
    date,
    description:
      e.type === 'topup' ? (e.method ? `Top-up (${e.method})` : 'Top-up') : e.name || undefined,
    serviceExternalId: e.type === 'server_charge' ? (e.serverId ?? undefined) : undefined,
  };
}
