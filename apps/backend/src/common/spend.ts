import Decimal from 'decimal.js';
import { burnFromSnapshots } from './runway';

const MS_PER_DAY = 86_400_000;

export interface SpendCharge {
  amount: Decimal;
  currency: string;
  paymentDate: Date;
}

export interface SpendSnapshot {
  balance: Decimal;
  currency: string;
  capturedAt: Date;
}

export interface SpendDay {
  date: string;
  amount: Decimal | null;
  estimated: boolean;
}

export interface AccountSpendResult {
  currency: string | null;
  source: 'charges' | 'snapshots' | null;
  approximate: boolean;
  coveredDays: number;
  days: SpendDay[];
  last7d: Decimal | null;
  last30d: Decimal | null;
  perDay: Decimal | null;
}

export interface AccountSpendInput {
  /** Charges inside the window; anything outside it is ignored. */
  charges: SpendCharge[];
  /** The account's first charge ever: before it the account had no charge history at all. */
  firstChargeAt: Date | null;
  /** Snapshots since the window start plus the last one before it (the anchor). */
  snapshots: SpendSnapshot[];
  balanceCurrency: string | null;
  /** False for postpaid accounts: their balance is not prepaid money, so its drops aren't spend. */
  useSnapshots: boolean;
  days: number;
  now: Date;
}

/**
 * The window is `days` complete UTC days ending today 00:00 UTC. Today is left out: it is still
 * filling up and would always look cheap.
 */
export function spendWindow(now: Date, days: number): { start: Date; end: Date } {
  const end = Math.floor(now.getTime() / MS_PER_DAY) * MS_PER_DAY;
  return { start: new Date(end - days * MS_PER_DAY), end: new Date(end) };
}

/**
 * Daily spend of one account in one currency. Provider charges win when there are any in the
 * window (they are exact); otherwise balance declines between snapshots are spread over the days
 * they span. A rising interval hides a top-up, so its spend is guessed from the account's average
 * rate and the result is marked approximate. Each day is rounded to cents and the totals are sums
 * of the rounded days, so the bars always add up to the figures.
 */
export function accountSpend(input: AccountSpendInput): AccountSpendResult {
  const { start, end } = spendWindow(input.now, input.days);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const inWindow = input.charges.filter((c) => {
    const t = c.paymentDate.getTime();
    return t >= startMs && t < endMs;
  });
  const currency = input.balanceCurrency ?? mostCommonCurrency(inWindow);
  if (!currency) return empty(start, input.days);

  const charges = inWindow.filter((c) => c.currency === currency);
  if (charges.length > 0) {
    return fromCharges(charges, input.firstChargeAt, currency, startMs, input.days);
  }
  if (!input.useSnapshots) return empty(start, input.days);
  const points = input.snapshots
    .filter((s) => s.currency === currency)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  if (points.length < 2) return empty(start, input.days);
  return fromSnapshots(points, currency, startMs, endMs, input.days);
}

function fromCharges(
  charges: SpendCharge[],
  firstChargeAt: Date | null,
  currency: string,
  startMs: number,
  days: number,
): AccountSpendResult {
  const sums = Array.from({ length: days }, () => new Decimal(0));
  let earliest = Number.POSITIVE_INFINITY;
  for (const c of charges) {
    const t = c.paymentDate.getTime();
    earliest = Math.min(earliest, t);
    const i = Math.floor((t - startMs) / MS_PER_DAY);
    sums[i] = sums[i].add(c.amount);
  }
  if (firstChargeAt) earliest = Math.min(earliest, firstChargeAt.getTime());
  // Days before the first charge ever are unknown, not zero: the history simply starts later.
  const firstIdx = Math.max(0, Math.floor((earliest - startMs) / MS_PER_DAY));
  const out = sums.map((sum, i) => ({
    date: isoDay(startMs + i * MS_PER_DAY),
    amount: i < firstIdx ? null : round(sum),
    estimated: false,
  }));
  return summarize(out, currency, 'charges', days - firstIdx);
}

function fromSnapshots(
  points: SpendSnapshot[],
  currency: string,
  startMs: number,
  endMs: number,
  days: number,
): AccountSpendResult {
  const coverStart = Math.max(startMs, points[0].capturedAt.getTime());
  const coverEnd = Math.min(endMs, points[points.length - 1].capturedAt.getTime());
  if (coverEnd <= coverStart) return empty(new Date(startMs), days);

  const rate = burnFromSnapshots(points);
  const sums = Array.from({ length: days }, () => new Decimal(0));
  const estimated = Array.from({ length: days }, () => false);
  for (let p = 1; p < points.length; p += 1) {
    const t0 = points[p - 1].capturedAt.getTime();
    const t1 = points[p].capturedAt.getTime();
    const dt = t1 - t0;
    if (dt <= 0) continue;
    const from = Math.max(t0, startMs);
    const to = Math.min(t1, endMs);
    if (to <= from) continue;
    const decline = points[p - 1].balance.sub(points[p].balance);
    const isTopUp = decline.isNegative();
    // No measurable rate (the balance never fell) leaves the top-up interval at zero.
    const spent = isTopUp ? (rate?.mul(dt / MS_PER_DAY) ?? new Decimal(0)) : decline;
    for (let i = Math.floor((from - startMs) / MS_PER_DAY); i < days; i += 1) {
      const dayStart = startMs + i * MS_PER_DAY;
      if (dayStart >= to) break;
      const overlap = Math.min(to, dayStart + MS_PER_DAY) - Math.max(from, dayStart);
      if (overlap <= 0) continue;
      sums[i] = sums[i].add(spent.mul(overlap).div(dt));
      if (isTopUp) estimated[i] = true;
    }
  }

  const out = sums.map((sum, i) => {
    const dayStart = startMs + i * MS_PER_DAY;
    const covered = dayStart < coverEnd && dayStart + MS_PER_DAY > coverStart;
    return {
      date: isoDay(dayStart),
      amount: covered ? round(sum) : null,
      estimated: covered && estimated[i],
    };
  });
  return summarize(out, currency, 'snapshots', (coverEnd - coverStart) / MS_PER_DAY);
}

function summarize(
  days: SpendDay[],
  currency: string,
  source: 'charges' | 'snapshots',
  spanDays: number,
): AccountSpendResult {
  const last30d = sumDays(days)!;
  return {
    currency,
    source,
    approximate: days.some((d) => d.estimated),
    coveredDays: days.filter((d) => d.amount !== null).length,
    days,
    last7d: sumDays(days.slice(-7)),
    last30d,
    perDay: round(last30d.div(spanDays)),
  };
}

/** Sum of the known days; null when none of them is known. */
function sumDays(days: SpendDay[]): Decimal | null {
  let total: Decimal | null = null;
  for (const d of days) {
    if (d.amount !== null) total = (total ?? new Decimal(0)).add(d.amount);
  }
  return total;
}

/** Most frequent currency; a tie goes to the alphabetically first so the pick is stable. */
function mostCommonCurrency(charges: SpendCharge[]): string | null {
  const counts = new Map<string, number>();
  for (const c of charges) counts.set(c.currency, (counts.get(c.currency) ?? 0) + 1);
  let best: string | null = null;
  for (const [cur, n] of counts) {
    const bestN = best ? counts.get(best)! : 0;
    if (n > bestN || (n === bestN && best !== null && cur < best)) best = cur;
  }
  return best;
}

function empty(start: Date, days: number): AccountSpendResult {
  return {
    currency: null,
    source: null,
    approximate: false,
    coveredDays: 0,
    days: Array.from({ length: days }, (_, i) => ({
      date: isoDay(start.getTime() + i * MS_PER_DAY),
      amount: null,
      estimated: false,
    })),
    last7d: null,
    last30d: null,
    perDay: null,
  };
}

function round(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
