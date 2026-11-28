import { Period } from '@infra/shared';
import Decimal from 'decimal.js';
import { normalizeCurrency } from '../common/currency';
import { PaymentData, ServiceData } from '../connector.interface';
import {
  IshostingBalanceInvoice,
  IshostingInvoice,
  IshostingInvoiceLine,
  IshostingService,
  IshostingServiceRef,
} from './ishosting.types';

export const ISHOSTING_FALLBACK_CURRENCY = 'USD';

/** Service kinds with a `/{kind}/{id}` endpoint. Others (subscription, ssl, …) are priced by invoices. */
export const ISHOSTING_DETAIL_KINDS = new Set(['vps', 'dedicated', 'storage', 'vpn']);

const SERVICE_TYPES: Record<string, string> = {
  vps: 'vps',
  dedicated: 'dedicated',
  storage: 'storage',
};

export interface Money {
  amount: Decimal;
  currency: string;
}

/** "49.99$", "-2.50$", "1,200€" → amount + currency code. */
export function parseIshostingMoney(raw: string): Money {
  const number = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!number) throw new Error(`ishosting: unexpected money value "${raw}"`);
  const sign = raw.replace(/[-\d.,\s]/g, '');
  return {
    amount: new Decimal(number[0]),
    currency: normalizeCurrency(sign || undefined, ISHOSTING_FALLBACK_CURRENCY),
  };
}

/** "Paid" on the live API, "STATUS_PAID" in the spec examples. */
export function isIshostingPaid(status: { code: string }): boolean {
  return status.code.toLowerCase().replace(/^status_/, '') === 'paid';
}

/**
 * Period codes are "<n>m" / "<n>y" ("1m", "3m", "1y"). Cycles we don't model map to the nearest
 * period with a pro-rated cost: 6m becomes monthly, 2y becomes yearly.
 */
export function resolveIshostingPeriod(
  code: string | null | undefined,
  cost: Decimal,
): { period: Period; cost: Decimal } | undefined {
  const m = /^(\d+)([my])$/.exec(code ?? '');
  if (!m) return undefined;
  const months = Number(m[1]) * (m[2] === 'y' ? 12 : 1);
  if (months <= 0) return undefined;
  if (months === 1) return { period: 'monthly', cost };
  if (months === 3) return { period: 'quarterly', cost };
  if (months % 12 === 0) return { period: 'yearly', cost: cost.div(months / 12) };
  return { period: 'monthly', cost: cost.div(months) };
}

const fromUnix = (s: number | null | undefined) => (s ? new Date(s * 1000) : undefined);

function countryOf(s: IshostingService): string | undefined {
  const code = s.location?.code?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined;
}

/**
 * The service name defaults to the plan name, identical across servers, so such services are
 * named "<country> <plan category> <n>" ("CL Premium 1"), numbered by id within the group.
 * A name the owner set in the ishosting panel is kept.
 */
export function ishostingServiceNames(services: IshostingService[]): Map<string, string> {
  const names = new Map<string, string>();
  const counters = new Map<string, number>();
  const byId = [...services].sort(
    (a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id),
  );
  for (const s of byId) {
    if (s.name && s.name !== s.plan.name) {
      names.set(s.id, s.name);
      continue;
    }
    const group = [countryOf(s), s.plan.category?.name ?? s.plan.name ?? s.name]
      .filter(Boolean)
      .join(' ');
    const n = (counters.get(group) ?? 0) + 1;
    counters.set(group, n);
    names.set(s.id, group ? `${group} ${n}` : s.id);
  }
  return names;
}

/** Cost is what a renewal actually charges: the plan total plus the (negative) promo discount. */
export function mapIshostingService(kind: string, s: IshostingService, name: string): ServiceData {
  const total = parseIshostingMoney(s.plan.total);
  const discount = s.plan.discount ? parseIshostingMoney(s.plan.discount).amount : new Decimal(0);
  const billing = resolveIshostingPeriod(s.plan.period?.code, total.amount.plus(discount));
  return {
    externalId: s.id,
    name,
    type: SERVICE_TYPES[kind] ?? 'other',
    countryCode: countryOf(s),
    cost: billing?.cost,
    currency: total.currency,
    period: billing?.period,
    nextBilling: fromUnix(s.plan.next_charge),
    meta: {
      ishostingKind: kind,
      ishostingName: s.name ?? null,
      plan: s.plan.name ?? null,
      planCode: s.plan.code ?? null,
      listPrice: total.amount.toFixed(2),
      discount: discount.toFixed(2),
      autoRenew: s.plan.auto_renew ?? null,
      ip: s.network?.public_ip ?? null,
      location: s.location?.name ?? null,
      status: s.status?.code ?? null,
      state: s.status?.state?.code ?? null,
      createdAt: fromUnix(s.created_at)?.toISOString() ?? null,
    },
  };
}

/** Newest paid invoice that bills each of `serviceIds`; `invoices` must be the whole list. */
export function latestPaidInvoiceByService(
  invoices: IshostingInvoice[],
  serviceIds: Set<string>,
): Map<string, IshostingInvoice> {
  const out = new Map<string, IshostingInvoice>();
  for (const inv of invoices) {
    if (!isIshostingPaid(inv.status)) continue;
    for (const line of inv.services ?? []) {
      const sid = line.service.id;
      if (!serviceIds.has(sid)) continue;
      const prev = out.get(sid);
      if (!prev || inv.invoiced_at > prev.invoiced_at) out.set(sid, inv);
    }
  }
  return out;
}

/**
 * A service without a detail endpoint (the is*smart subscription, SSL, …), priced by its line on
 * the newest paid invoice: the line total is the renewal price, the paid period's end is the next
 * charge. Without such a line it is listed with no price, so the sync keeps the stored one.
 */
export function mapIshostingInvoicedService(
  ref: IshostingServiceRef,
  line: IshostingInvoiceLine | undefined,
): ServiceData {
  const plan = line?.service.plan;
  const total = line?.total ? parseIshostingMoney(line.total) : undefined;
  const billing = total && resolveIshostingPeriod(plan?.period?.code, total.amount);
  return {
    externalId: ref.id,
    name: ref.name || plan?.name || ref.id,
    type: SERVICE_TYPES[ref.type] ?? 'other',
    cost: billing?.cost,
    currency: total?.currency,
    period: billing?.period,
    nextBilling: fromUnix(line?.period?.finish_at),
    meta: {
      ishostingKind: ref.type,
      plan: plan?.name ?? null,
      planCode: plan?.code ?? null,
      autoRenew: plan?.auto_renew ?? null,
    },
  };
}

/**
 * Money in: paid balance top-ups (`income`) and paid service invoices settled directly (card,
 * crypto, …) → `topup`. A service invoice paid from the balance is skipped as a top-up, that
 * money was counted when the balance was topped up; its balance `outcome` becomes a `charge`,
 * linked to the service when the invoice bills exactly one.
 */
export function mapIshostingPayments(
  invoices: IshostingInvoice[],
  balance: IshostingBalanceInvoice[],
): PaymentData[] {
  const invoicesById = new Map(invoices.map((inv) => [inv.id, inv]));
  const paidBalance = balance.filter((b) => isIshostingPaid(b.status));
  const paidFromBalance = new Set(
    paidBalance.filter((b) => b.type === 'outcome' && b.invoice_id).map((b) => b.invoice_id),
  );
  const out: PaymentData[] = [];

  for (const inv of invoices) {
    if (!isIshostingPaid(inv.status) || !inv.paid || paidFromBalance.has(inv.id)) continue;
    const paid = parseIshostingMoney(inv.paid);
    if (paid.amount.lte(0)) continue;
    out.push({
      externalId: `invoice:${inv.id}`,
      type: 'topup',
      amount: paid.amount,
      currency: paid.currency,
      date: new Date((inv.paid_at ?? inv.invoiced_at) * 1000),
      description: `Invoice ${inv.id}`,
    });
  }

  for (const b of paidBalance) {
    if (b.type !== 'income' && b.type !== 'outcome') continue;
    const total = parseIshostingMoney(b.total);
    const amount = total.amount.abs();
    if (amount.isZero()) continue;
    const date = new Date((b.paid_at ?? b.invoiced_at) * 1000);
    if (b.type === 'income') {
      out.push({
        externalId: `balance:${b.id}`,
        type: 'topup',
        amount,
        currency: total.currency,
        date,
        description: 'Balance top-up',
      });
      continue;
    }
    const lines = (b.invoice_id && invoicesById.get(b.invoice_id)?.services) || [];
    out.push({
      externalId: `balance:${b.id}`,
      type: 'charge',
      amount,
      currency: total.currency,
      date,
      description: b.invoice_id ? `Invoice ${b.invoice_id}` : 'Balance charge',
      serviceExternalId: lines.length === 1 ? lines[0].service.id : undefined,
    });
  }
  return out;
}
