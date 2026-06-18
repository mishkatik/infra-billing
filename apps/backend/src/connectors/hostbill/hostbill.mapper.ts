import Decimal from 'decimal.js';
import { normalizeCurrency } from '../common/currency';
import { PaymentData, ServiceData } from '../connector.interface';
import { HostbillInvoice, HostbillService } from './hostbill.types';

/** HostBill defaults to USD when the currency label isn't recognized (used by the connector too). */
export const HOSTBILL_FALLBACK_CURRENCY = 'USD';

const SKIP_STATUSES = new Set(['cancelled', 'terminated', 'fraud']);

/** Active services only: cancelled/terminated/fraud are not current expenses. */
export function isActiveHostbillService(s: HostbillService): boolean {
  return !SKIP_STATUSES.has((s.status ?? '').toLowerCase());
}

// HostBill dates: "2026-05-24" or "2026-05-24 00:42:28"; "0000-00-00…" means unset.
function parseInvoiceDate(s?: string): Date | undefined {
  const day = (s ?? '').split(' ')[0];
  if (!day || day.startsWith('0000')) return undefined;
  const d = new Date(day);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Map a HostBill billing cycle to our period. Cycles we don't model
 * (semi-annual/biennial/triennial) are normalized to a monthly-equivalent cost.
 */
function resolveBilling(cycle: string, total: string): { period: string; cost: Decimal } {
  const t = new Decimal(total || 0);
  switch (cycle) {
    case 'Monthly':
      return { period: 'monthly', cost: t };
    case 'Quarterly':
      return { period: 'quarterly', cost: t };
    case 'Annually':
      return { period: 'yearly', cost: t };
    case 'One Time':
    case 'Free':
      return { period: 'onetime', cost: t };
    case 'Semi-Annually':
      return { period: 'monthly', cost: t.div(6) };
    case 'Biennially':
      return { period: 'monthly', cost: t.div(24) };
    case 'Triennially':
      return { period: 'monthly', cost: t.div(36) };
    default:
      return { period: 'monthly', cost: t };
  }
}

/** Map a HostBill service to our domain Service. */
export function mapHostbillService(s: HostbillService): ServiceData {
  const { period, cost } = resolveBilling(s.billingcycle ?? 'Monthly', s.total ?? '0');
  return {
    externalId: String(s.id),
    name: s.name || s.domain || `service-${s.id}`,
    type: 'vps',
    cost,
    period,
    nextBilling: s.next_due ? new Date(s.next_due) : undefined,
    meta: { ...s },
  };
}

/**
 * Map a PAID HostBill invoice to a payment (type=topup, dated by datepaid). Returns null for
 * unpaid invoices or ones without a usable date — they aren't payment facts. HostBill exposes no
 * per-service breakdown, so payments stay provider-level (no serviceExternalId).
 */
export function invoiceToPayment(inv: HostbillInvoice): PaymentData | null {
  if ((inv.status ?? '').toLowerCase() !== 'paid') return null;
  const date = parseInvoiceDate(inv.datepaid) ?? parseInvoiceDate(inv.date);
  if (!date) return null;
  return {
    externalId: `invoice:${inv.id}`,
    type: 'topup',
    amount: new Decimal(inv.total ?? inv.subtotal ?? 0),
    currency: normalizeCurrency(inv.currency, HOSTBILL_FALLBACK_CURRENCY),
    date,
    description: `Invoice ${inv.number ?? inv.id}`,
  };
}
