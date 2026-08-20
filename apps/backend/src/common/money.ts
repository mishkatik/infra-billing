import Decimal from 'decimal.js';
import { Period } from '@infra/shared';

const HOURS_PER_MONTH = 730;
const DAYS_PER_MONTH = new Decimal(HOURS_PER_MONTH).div(24); // ≈30.42, consistent with hourly

/** Money field from a provider API where absent/null means zero. */
export function toDecimal(value: Decimal.Value | null | undefined): Decimal {
  return new Decimal(value ?? 0);
}

/**
 * Normalize a per-period cost to a monthly cost (same currency, no FX).
 * onetime → 0 (capital expense, excluded from recurring totals).
 */
export function monthlyCost(cost: Decimal.Value, period: Period): Decimal {
  const c = new Decimal(cost);
  switch (period) {
    case 'monthly':
      return c;
    case 'yearly':
      return c.div(12);
    case 'quarterly':
      return c.div(3);
    case 'daily':
      return c.mul(DAYS_PER_MONTH);
    case 'hourly':
      return c.mul(HOURS_PER_MONTH);
    case 'onetime':
      return new Decimal(0);
    default:
      return new Decimal(0);
  }
}
