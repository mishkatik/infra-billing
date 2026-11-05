import Decimal from 'decimal.js';
import { ServiceData } from '../connector.interface';
import { PorkbunDomain } from './porkbun.types';

// Porkbun dates are "YYYY-MM-DD HH:mm:ss" with no zone → treat as UTC.
function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** The domain's TLD without a leading dot: Porkbun's `tld` field, or everything after the first dot. */
export function porkbunTld(d: PorkbunDomain): string {
  return (d.tld || d.domain.split('.').slice(1).join('.')).replace(/^\./, '').toLowerCase();
}

/**
 * Whether the domain is still on the account. An expired domain Porkbun has moved off ACTIVE
 * (e.g. AUCTION) is gone; one still ACTIVE past its expiry is in the grace period and stays
 * (shown overdue, it can still be renewed). A non-ACTIVE status before expiry also stays.
 */
export function isLivePorkbunDomain(d: PorkbunDomain, now = new Date()): boolean {
  if (!d.status || d.status.toUpperCase() === 'ACTIVE') return true;
  const expires = parseDate(d.expireDate);
  return !expires || expires.getTime() > now.getTime();
}

/**
 * Map a Porkbun domain to our Service. Cost is the TLD's yearly renewal price (USD), looked up
 * from the pricing list; domains have no location so countryCode is left unset.
 */
export function mapPorkbunDomain(
  d: PorkbunDomain,
  renewalByTld: Map<string, Decimal>,
): ServiceData {
  const tld = porkbunTld(d);
  return {
    externalId: d.domain,
    name: d.domain,
    type: 'domain',
    cost: renewalByTld.get(tld),
    currency: 'USD',
    period: 'yearly',
    nextBilling: parseDate(d.expireDate),
    meta: {
      tld,
      status: d.status,
      autoRenew: d.autoRenew,
      securityLock: d.securityLock,
      whoisPrivacy: d.whoisPrivacy,
      notLocal: d.notLocal,
      createDate: d.createDate,
    },
  };
}
