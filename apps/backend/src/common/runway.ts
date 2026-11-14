import Decimal from 'decimal.js';

const DAYS_PER_MONTH = new Decimal(730).div(24); // ≈30.42, consistent with common/money.ts
const MS_PER_DAY = 86_400_000;

export interface SnapPoint {
  balance: Decimal;
  capturedAt: Date;
}

/**
 * Average daily spend inferred from balance decline, ignoring top-up intervals.
 *   spent    = Σ max(0, prev-cur) over consecutive snapshots (observed declines)
 *   spanDays = Σ elapsed days over non-increasing pairs (declines + flats, but NOT top-ups)
 * Top-up intervals are dropped from both sums: within a 6h snapshot window we can't tell the
 * top-up apart from the spend, so counting them would understate the burn. Flat intervals stay
 * (they are genuine low-spend periods and correctly pull the average down).
 * Returns null when there is < minSpanDays of usable history or no observed decline.
 */
export function burnFromSnapshots(points: SnapPoint[], minSpanDays = 1): Decimal | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  let spent = new Decimal(0);
  let spanDays = new Decimal(0);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const dtDays = (cur.capturedAt.getTime() - prev.capturedAt.getTime()) / MS_PER_DAY;
    if (dtDays <= 0) continue;
    const delta = prev.balance.sub(cur.balance); // > 0 = balance dropped (spend)
    if (delta.isNegative()) continue; // top-up interval, drop it entirely
    spent = spent.add(delta);
    spanDays = spanDays.add(dtDays);
  }
  if (spanDays.lt(minSpanDays) || spent.lte(0)) return null;
  return spent.div(spanDays);
}

/** Σ monthly cost (already in the balance currency) ÷ 30.42 → daily; null if not positive. */
export function burnFromMonthlyCost(monthlyInBalanceCcy: Decimal): Decimal | null {
  if (monthlyInBalanceCcy.lte(0)) return null;
  return monthlyInBalanceCcy.div(DAYS_PER_MONTH);
}

/** Whole days a balance lasts at a given daily burn (floored). Non-positive inputs → 0. */
export function daysOfRunway(balance: Decimal, burnPerDay: Decimal): number {
  if (burnPerDay.lte(0) || balance.lte(0)) return 0;
  return balance.div(burnPerDay).floor().toNumber();
}

/** Whole hours a balance lasts at a given daily burn (floored). Non-positive inputs → 0. */
export function hoursOfRunway(balance: Decimal, burnPerDay: Decimal): number {
  if (burnPerDay.lte(0) || balance.lte(0)) return 0;
  return balance.mul(24).div(burnPerDay).floor().toNumber();
}
