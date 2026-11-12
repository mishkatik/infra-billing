import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import { TubeHostingPaymentEntry, TubeHostingServiceGroup } from './tubehosting.types';

/** Tube-Hosting bills in euro; the API has no currency field. */
export const TUBEHOSTING_CURRENCY = 'EUR';

const DAY_SECONDS = 86_400;
// Ended groups are not a current expense; BLOCKED/EXPIRED still owe a renewal, so they stay.
const ENDED_STATUSES = new Set(['DELETED', 'DEACTIVATED']);
// A group can mix services (server + IPv4 bundle); the first match decides its type.
const TYPE_PRIORITY: [string, string][] = [
  ['DEDICATED', 'dedicated'],
  ['VPS', 'vps'],
  ['DOMAIN', 'domain'],
];

export const fromCents = (cents: number): Decimal => new Decimal(cents).div(100);

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Runtime interval (seconds) → our period; odd intervals become a 30-day monthly equivalent. */
function resolvePeriod(intervalSeconds: number, cost: Decimal): { period: string; cost: Decimal } {
  const days = intervalSeconds / DAY_SECONDS;
  if (days <= 0 || (days >= 28 && days <= 31)) return { period: 'monthly', cost };
  if (days >= 89 && days <= 92) return { period: 'quarterly', cost };
  if (days >= 360 && days <= 366) return { period: 'yearly', cost };
  return { period: 'monthly', cost: cost.mul(30).div(days).toDecimalPlaces(2) };
}

export function isLiveTubeHostingGroup(g: TubeHostingServiceGroup): boolean {
  return !ENDED_STATUSES.has(g.metaData.status);
}

/**
 * One service per service group (a server with its add-ons, e.g. an IPv4/bandwidth bundle).
 * The renewal charges the sum of its services' prices (or the group's own price when set);
 * the next charge is the paid-until `runtime`. The API exposes no datacenter → no country.
 */
export function mapTubeHostingGroup(g: TubeHostingServiceGroup): ServiceData {
  const services = g.groupData?.services ?? [];
  const cents = g.groupData?.price ?? services.reduce((sum, s) => sum + (s.price ?? 0), 0);
  const { period, cost } = resolvePeriod(g.groupData?.runtimeInterval ?? 0, fromCents(cents));
  const label = services.map((s) => s.description?.trim()).find(Boolean);
  const types = new Set(services.map((s) => s.type));
  return {
    externalId: String(g.id),
    name: label ? `${g.metaData.name} (${label})` : g.metaData.name,
    type: TYPE_PRIORITY.find(([t]) => types.has(t))?.[1] ?? 'other',
    cost,
    currency: TUBEHOSTING_CURRENCY,
    period,
    nextBilling: parseDate(g.metaData.runtime),
    // Explicit allowlist: the API also returns owner details, which must not be stored.
    meta: {
      status: g.metaData.status,
      runtimeIntervalDays: (g.groupData?.runtimeInterval ?? 0) / DAY_SECONDS,
      services: services.map((s) => ({
        type: s.type,
        description: s.description ?? null,
        price: fromCents(s.price ?? 0).toFixed(2),
      })),
    },
  };
}

/**
 * A ledger entry ("payment bundle") → payments:
 * - a PAID payment (PayPal, card, …) is a top-up;
 * - an invoice that was settled (from the balance or by that payment) yields one charge per
 *   line, linked to its service group. Unsettled invoices and bare balance adjustments are skipped.
 */
export function mapTubeHostingEntry(e: TubeHostingPaymentEntry): PaymentData[] {
  const out: PaymentData[] = [];
  const entryDate = parseDate(e.time);
  const paid = e.payment?.status === 'PAID';
  if (e.payment && paid && e.payment.amount > 0) {
    const date = parseDate(e.payment.timeFinished) ?? entryDate;
    if (date) {
      out.push({
        externalId: `payment:${e.payment.id}`,
        type: 'topup',
        amount: fromCents(e.payment.amount),
        currency: TUBEHOSTING_CURRENCY,
        date,
        description: e.payment.method ?? undefined,
      });
    }
  }
  const settled = paid || (e.balanceChange != null && e.balanceChange.successful !== false);
  if (e.invoice && settled && entryDate) {
    for (const item of e.invoice.items) {
      const amount = fromCents(item.unitPrice * item.quantity);
      if (amount.lte(0)) continue;
      out.push({
        externalId: `invoice:${e.invoice.id}:${item.position}`,
        type: 'charge',
        amount,
        currency: TUBEHOSTING_CURRENCY,
        date: entryDate,
        description: item.description ?? item.title ?? undefined,
        serviceExternalId: item.serviceGroupId != null ? String(item.serviceGroupId) : undefined,
      });
    }
  }
  return out;
}
