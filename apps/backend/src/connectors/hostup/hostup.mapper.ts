import Decimal from 'decimal.js';
import { normalizeCurrency } from '../common/currency';
import { PaymentData, ServiceData } from '../connector.interface';
import {
  HostupDomain,
  HostupPaidPeriod,
  HostupServiceBilling,
  HostupServiceStatus,
  HostupSharedHosting,
  HostupTransaction,
  HostupVps,
} from './hostup.types';

/** HostUp is a Swedish hoster: accounts are billed in SEK unless switched to EUR. */
export const HOSTUP_FALLBACK_CURRENCY = 'SEK';

const MS_PER_DAY = 86_400_000;

// Gone for good: not a current expense. `expired`/`suspended` stay — they still await payment.
const SKIP_STATUSES = new Set<HostupServiceStatus>([
  'terminated',
  'cancelled',
  'fraud',
  'transferred_out',
]);

/** Services that are still a current (or pending) expense. */
export function isLiveHostupService(s: { serviceStatus: HostupServiceStatus }): boolean {
  return !SKIP_STATUSES.has(s.serviceStatus);
}

/** ISO timestamp or a bare `YYYY-MM-DD` day (read as UTC midnight); undefined when unusable. */
function parseDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Cycles we don't model map to the nearest period with a pro-rated cost: semi-annual becomes
 * monthly, two and three years become yearly. Domains with a 4-9 year registration come with a
 * null cycle and `periodYears` instead. No amount (pay-as-you-go Cloud VPS) → no price.
 */
export function resolveHostupBilling(
  b: HostupServiceBilling,
): { period: string; cost: Decimal } | undefined {
  if (b.amount === null || b.amount === undefined) return undefined;
  const amount = new Decimal(String(b.amount));
  switch (b.billingCycle) {
    case 'monthly':
      return { period: 'monthly', cost: amount };
    case 'quarterly':
      return { period: 'quarterly', cost: amount };
    case 'semiannually':
      return { period: 'monthly', cost: amount.div(6) };
    case 'annually':
      return { period: 'yearly', cost: amount };
    case 'biennially':
      return { period: 'yearly', cost: amount.div(2) };
    case 'triennially':
      return { period: 'yearly', cost: amount.div(3) };
    case 'free':
      return { period: 'onetime', cost: amount };
    default:
      if (b.periodYears && b.periodYears > 0) {
        return { period: 'yearly', cost: amount.div(b.periodYears) };
      }
      return undefined;
  }
}

/**
 * Next charge date of a fixed-cycle VPS. An issued unpaid renewal invoice wins (that is the date
 * money is due); otherwise the day after the paid (or staff-covered) period ends. The paid-through
 * day only counts once HostUp has verified it: while refreshing or under review it may be stale.
 * Undefined when HostUp can't tell yet, so the sync keeps the stored date instead of wiping it.
 */
export function hostupVpsNextBilling(pp: HostupPaidPeriod | undefined): Date | undefined {
  if (!pp || pp.status === 'unavailable') return undefined;
  const outstanding = parseDate(pp.outstandingInvoiceDueDate);
  if (outstanding) return outstanding;
  if (pp.status !== 'verified') return undefined;
  const paid = parseDate(pp.paidThroughDate);
  const entitled = parseDate(pp.entitledThroughDate);
  const through =
    paid && entitled ? (entitled > paid ? entitled : paid) : (paid ?? entitled ?? undefined);
  return through ? new Date(through.getTime() + MS_PER_DAY) : undefined;
}

function currencyOf(b: HostupServiceBilling): string {
  return normalizeCurrency(b.currencyCode, HOSTUP_FALLBACK_CURRENCY);
}

/**
 * HostUp's API exposes no location for a VPS, so the country is left for the owner to set.
 * `paidPeriod` comes from the list row or, when absent there, from /vps/paid-periods.
 */
export function mapHostupVps(v: HostupVps, paidPeriod?: HostupPaidPeriod): ServiceData {
  const billing = resolveHostupBilling(v.billing);
  const pp = v.paidPeriod ?? paidPeriod;
  return {
    externalId: v.id,
    name: v.customerMetadata?.displayName || v.name || v.primaryIp || v.id,
    type: 'vps',
    cost: billing?.cost,
    currency: currencyOf(v.billing),
    period: billing?.period,
    nextBilling: hostupVpsNextBilling(pp),
    meta: {
      hostupKind: 'vps',
      hostupName: v.name,
      primaryIp: v.primaryIp,
      serviceStatus: v.serviceStatus,
      powerState: v.powerState ?? null,
      os: v.operatingSystem?.displayName ?? null,
      resources: v.resources ?? null,
      billingCycle: v.billing.billingCycle,
      isPayg: v.billing.isPayg === true,
      paidPeriod: pp ?? null,
      tags: v.tags ?? [],
      createdAt: v.createdAt ?? null,
    },
  };
}

/** cPanel web hosting account; no built-in type fits, so it lands as `other`. */
export function mapHostupSharedHosting(h: HostupSharedHosting): ServiceData {
  const billing = resolveHostupBilling(h.billing);
  return {
    externalId: h.id,
    name: h.customName || h.name || h.primaryDomain || h.id,
    type: 'other',
    cost: billing?.cost,
    currency: currencyOf(h.billing),
    period: billing?.period,
    nextBilling: parseDate(h.nextDueAt) ?? parseDate(h.expiresAt),
    meta: {
      hostupKind: 'shared-hosting',
      primaryDomain: h.primaryDomain,
      serviceStatus: h.serviceStatus,
      billingCycle: h.billing.billingCycle,
      controlPanel: h.controlPanel?.type ?? null,
      expiresAt: h.expiresAt,
      tags: h.tags ?? [],
      createdAt: h.createdAt ?? null,
    },
  };
}

/**
 * Domain: `nextDueAt` is when the renewal invoice falls due (ahead of `expiresAt`), so it is the
 * charge date; expiry is the fallback. The price is the recurring `billing.amount`.
 */
export function mapHostupDomain(d: HostupDomain): ServiceData {
  const billing = resolveHostupBilling(d.billing);
  return {
    externalId: d.id,
    name: d.name,
    type: 'domain',
    cost: billing?.cost,
    currency: currencyOf(d.billing),
    period: billing?.period ?? 'yearly',
    nextBilling: parseDate(d.nextDueAt) ?? parseDate(d.expiresAt),
    meta: {
      hostupKind: 'domain',
      serviceStatus: d.serviceStatus,
      billingCycle: d.billing.billingCycle,
      periodYears: d.billing.periodYears ?? null,
      autoRenew: d.lifecycle?.autoRenewEnabled ?? null,
      expiresAt: d.expiresAt,
      tags: d.tags ?? [],
      createdAt: d.createdAt ?? null,
    },
  };
}

// Methods that move money between HostUp's own ledgers rather than bring new money in.
const INTERNAL_METHODS = new Set<HostupTransaction['method']>(['accountCredit', 'rounding']);

// Methods that bring new money in from outside HostUp.
const EXTERNAL_METHODS = new Set<HostupTransaction['method']>([
  'card',
  'swish',
  'bankgiro',
  'sepa',
  'alipay',
  'crypto',
  'paypal',
  'invoice',
]);

/**
 * A settled payment or credit purchase made with real money (card, Swish, Bankgiro, SEPA, …) →
 * `topup`, the same fact HostBill's paid invoices record. Invoices settled from the account
 * credit are skipped: that money was already counted when the credit was bought. Refunds have no
 * representation in the ledger model (amounts are unsigned), so they are left out as well.
 * `credit_added` also covers refunds moved onto the balance, so it only counts with a method that
 * names where outside money came from.
 */
export function mapHostupTransaction(t: HostupTransaction): PaymentData | null {
  if (t.kind !== 'payment' && t.kind !== 'credit_added') return null;
  if (t.status !== 'settled') return null;
  if (INTERNAL_METHODS.has(t.method)) return null;
  if (t.kind === 'credit_added' && !EXTERNAL_METHODS.has(t.method)) return null;
  const date = parseDate(t.createdAt);
  if (!date) return null;
  const amount = new Decimal(String(t.amount)).abs();
  if (amount.isZero()) return null;
  const parts = [t.methodLabel, t.invoiceNumber ? `invoice ${t.invoiceNumber}` : null].filter(
    Boolean,
  );
  return {
    externalId: `transaction:${t.id}`,
    type: 'topup',
    amount,
    currency: normalizeCurrency(t.currencyCode, HOSTUP_FALLBACK_CURRENCY),
    date,
    description: t.description || parts.join(', ') || undefined,
  };
}
