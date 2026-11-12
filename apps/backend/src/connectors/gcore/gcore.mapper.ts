import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import {
  GcoreCostRow,
  GcoreOperation,
  gcoreExpenseDetailsSchema,
  gcorePaymentDetailsSchema,
} from './gcore.types';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DAYS_PER_MONTH = 30;
/** Window used to turn recent spend into a monthly price. */
export const GCORE_RATE_WINDOW_DAYS = 7;
// A resource last seen this long before the report's freshest row is gone. Measured against the
// report itself, not the clock, because its statistics can lag by hours.
const GONE_AFTER_MS = 6 * HOUR_MS;

const CLOUD_TYPES: Record<string, string> = {
  instance: 'vps',
  baremetal: 'dedicated',
  volume: 'storage',
  snapshot: 'storage',
  backup: 'storage',
  image: 'storage',
  file_share: 'storage',
};

/** "currency.EUR" → "EUR". */
export function gcoreCurrency(unitCode: string): string | null {
  return unitCode.startsWith('currency.') ? unitCode.slice('currency.'.length) : null;
}

/** Gcore timestamps sometimes come without a zone ("2026-11-10T21:54:30"); they are UTC. */
export function parseGcoreDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const num = (v: string | number | null | undefined) => new Decimal(v ?? 0);

/** Monthly price from `spend` accrued over `ms` milliseconds (at least an hour). */
function monthly(spend: Decimal, ms: number): Decimal {
  return spend
    .mul(DAYS_PER_MONTH * DAY_MS)
    .div(Math.max(ms, HOUR_MS))
    .toDecimalPlaces(2);
}

/** A card/bank payment credited to the account (`payment.paid` on `client.debit`) → top-up. */
export function mapGcoreTopup(op: GcoreOperation): PaymentData | null {
  if (op.action.type_code !== 'payment.paid' || op.acc !== 'client.debit' || op.action.deleted) {
    return null;
  }
  const amount = num(op.credit).minus(num(op.debit)).toDecimalPlaces(2);
  const currency = gcoreCurrency(op.unit_code);
  const date = parseGcoreDate(op.action.applying_at);
  if (!currency || !date || amount.lte(0)) return null;
  const details = gcorePaymentDetailsSchema.safeParse(op.action.details_json);
  return {
    externalId: `payment:${op.action.object_id ?? op.action.id}`,
    type: 'topup',
    amount,
    currency,
    date,
    description: (details.success && details.data.description) || 'Gcore payment',
  };
}

interface Expense {
  featureId: number;
  featureName: string;
  product: string | null;
  amount: Decimal;
  currency: string;
  date: Date;
}

/** The `expense` leg of an `expense.create` (one per expense; its debit is the amount). */
export function toGcoreExpense(op: GcoreOperation): Expense | null {
  if (op.action.type_code !== 'expense.create' || op.acc !== 'expense' || op.action.deleted) {
    return null;
  }
  const details = gcoreExpenseDetailsSchema.safeParse(op.action.details_json);
  const currency = gcoreCurrency(op.unit_code);
  const date = parseGcoreDate(op.action.applying_at);
  if (!details.success || !currency || !date) return null;
  const { feature, product } = details.data;
  return {
    featureId: feature.id,
    featureName: feature.name_en || `Feature ${feature.id}`,
    product: product?.internal_name ?? null,
    amount: num(op.debit).minus(num(op.credit)),
    currency,
    date,
  };
}

export const gcoreFeatureExternalId = (featureId: number) => `feature:${featureId}`;

/**
 * Expenses are posted many times a day per billing feature; keep the ledger readable with one
 * charge per feature and UTC day (re-synced days are updated in place by externalId).
 */
export function aggregateGcoreCharges(expenses: Expense[]): PaymentData[] {
  const byKey = new Map<string, PaymentData>();
  for (const e of expenses) {
    const day = e.date.toISOString().slice(0, 10);
    const key = `expense:${e.featureId}:${e.currency}:${day}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.amount = prev.amount.plus(e.amount);
      continue;
    }
    byKey.set(key, {
      externalId: key,
      type: 'charge',
      amount: e.amount,
      currency: e.currency,
      date: new Date(`${day}T00:00:00Z`),
      description: e.featureName,
      serviceExternalId: gcoreFeatureExternalId(e.featureId),
    });
  }
  return [...byKey.values()]
    .map((p) => ({ ...p, amount: p.amount.toDecimalPlaces(2) }))
    .filter((p) => p.amount.gt(0));
}

/**
 * Ledger fallback (token can't read the Cloud cost report, or non-Cloud products): one service per
 * billing feature, priced from its expenses over {@link GCORE_RATE_WINDOW_DAYS} days. Expenses are
 * posted in batches every few hours, so the window ends at the latest posted expense, not now.
 * `ledgerStart` is the oldest fetched operation, so a younger account isn't under-priced.
 */
export function mapGcoreFeatureServices(
  expenses: Expense[],
  now: Date,
  ledgerStart: Date | null,
  include: (e: Expense) => boolean = () => true,
): ServiceData[] {
  const anchor =
    expenses.reduce<Date | null>((max, e) => (!max || e.date > max ? e.date : max), null) ?? now;
  const windowStart = new Date(anchor.getTime() - GCORE_RATE_WINDOW_DAYS * DAY_MS);
  const from = ledgerStart && ledgerStart > windowStart ? ledgerStart : windowStart;
  const span = anchor.getTime() - from.getTime();
  const byFeature = new Map<number, { e: Expense; sum: Decimal }>();
  for (const e of expenses) {
    if (e.date <= windowStart || !include(e)) continue;
    const prev = byFeature.get(e.featureId);
    if (prev) prev.sum = prev.sum.plus(e.amount);
    else byFeature.set(e.featureId, { e, sum: e.amount });
  }
  return [...byFeature.values()]
    .filter(({ sum }) => sum.gt(0))
    .map(({ e, sum }) => ({
      externalId: gcoreFeatureExternalId(e.featureId),
      name: e.featureName,
      type: featureType(e.featureName),
      cost: monthly(sum, span),
      currency: e.currency,
      period: 'monthly',
      nextBilling: null,
      meta: { source: 'ledger', product: e.product, featureId: e.featureId },
    }));
}

function featureType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('bare metal') || n.includes('baremetal')) return 'dedicated';
  if (n.includes('virtual machine') || /\b[a-z]\d+[a-z]*-[a-z]+-\d+-\d+\b/.test(n)) return 'vps';
  if (n.includes('storage') || n.includes('volume') || n.includes('snapshot')) return 'storage';
  if (n.includes('cdn')) return 'cdn';
  return 'other';
}

/**
 * Join key between the v1 and v2 cost reports: v1 has no uuid for public IPs, but its `ip_address`
 * is the v2 resource `name`.
 */
export function gcoreAttachmentKey(
  type: string,
  uuid: string | null | undefined,
  nameOrIp: string | null | undefined,
): string {
  return type === 'external_ip' ? `ip:${nameOrIp ?? ''}` : `uuid:${uuid ?? ''}`;
}

/**
 * Cloud cost report → one service per instance, with the volumes and public IPs attached to it
 * folded in (from the v1 report's `attached_to_vm`, keyed by {@link gcoreAttachmentKey}); detached
 * resources stay separate. Price is the resource's cost over the time it was seen in the report
 * (`first_seen`..`last_seen`, both inside the period), scaled to 30 days. The report's timestamps
 * are not reliably UTC, so they are only compared with each other, never with the clock. Resources
 * unseen for {@link GONE_AFTER_MS} are dropped; zero-cost services (e.g. free egress) are skipped.
 */
export function mapGcoreCloudServices(
  rows: GcoreCostRow[],
  attachedTo: Map<string, string>,
  countryByRegion: Map<number, string>,
): ServiceData[] {
  const services = new Map<string, ServiceData & { cost: Decimal }>();
  const parts: { row: GcoreCostRow; cost: Decimal }[] = [];
  const freshest = Math.max(...rows.map((r) => parseGcoreDate(r.usage.last_seen)?.getTime() ?? 0));
  for (const row of rows) {
    const last = parseGcoreDate(row.usage.last_seen);
    if (last && freshest - last.getTime() > GONE_AFTER_MS) continue;
    const first = parseGcoreDate(row.usage.first_seen);
    const seenMs = first && last ? last.getTime() - first.getTime() : 0;
    const cost = monthly(num(row.usage.cost), seenMs);
    parts.push({ row, cost });
  }
  // Instances first so attached volumes/IPs find their parent (even a stopped, zero-cost one).
  const isInstance = (r: GcoreCostRow) => r.resource.type === 'instance';
  parts.sort((a, b) => Number(isInstance(b.row)) - Number(isInstance(a.row)));
  for (const { row, cost } of parts) {
    const { resource, usage } = row;
    const parentId = attachedTo.get(
      gcoreAttachmentKey(resource.type, resource.uuid, resource.name),
    );
    const parent = parentId ? services.get(`cloud:${parentId}`) : undefined;
    if (parent) {
      parent.cost = parent.cost.plus(cost);
      (parent.meta.attached as unknown[]).push({
        type: resource.type,
        name: resource.name ?? null,
        cost: cost.toFixed(2),
      });
      continue;
    }
    const externalId = resource.uuid
      ? `cloud:${resource.uuid}`
      : `cloud:${resource.type}:${row.project_id ?? 0}:${row.region_id ?? 0}`;
    services.set(externalId, {
      externalId,
      name: resource.name || `${resource.type} ${resource.uuid ?? row.region_id ?? ''}`.trim(),
      type: CLOUD_TYPES[resource.type] ?? 'other',
      countryCode: row.region_id != null ? countryByRegion.get(row.region_id) : undefined,
      cost,
      currency: usage.currency ?? undefined,
      period: 'monthly',
      nextBilling: null,
      meta: {
        source: 'cost_report',
        resourceType: resource.type,
        flavor: resource.flavor ?? null,
        projectId: row.project_id ?? null,
        regionId: row.region_id ?? null,
        attached: [],
      },
    });
  }
  return [...services.values()]
    .filter((s) => s.cost.gt(0))
    .map((s) => ({ ...s, cost: s.cost.toDecimalPlaces(2) }));
}
