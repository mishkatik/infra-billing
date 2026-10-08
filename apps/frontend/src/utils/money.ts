import type { Period, Rate } from '@infra/shared';

/** RUB per 1 unit of each currency code; RUB itself is always 1. */
export function buildRubMap(rates: Rate[] | undefined): Map<string, number> {
  const map = new Map<string, number>([['RUB', 1]]);
  for (const r of rates ?? []) {
    const value = Number(r.rate);
    if (Number.isFinite(value) && value > 0) map.set(r.code, value);
  }
  return map;
}

/**
 * Convert a decimal-string amount from one currency to the base via RUB
 * (mirrors backend CurrencyService.convert). Used for ordering only, so unlike
 * the backend (which falls back to the raw amount when a rate is missing) a
 * missing rate returns null — mixing unconverted magnitudes into a sort would
 * silently produce a wrong order, while null rows are grouped at the end.
 */
export function toBaseAmount(
  amount: string | number,
  from: string | null | undefined,
  base: string,
  rubPer: Map<string, number>,
): number | null {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  if (from === base) return value;
  const fromRate = from ? rubPer.get(from) : undefined;
  const baseRate = rubPer.get(base);
  if (fromRate === undefined || baseRate === undefined) return null;
  return (value * fromRate) / baseRate;
}

const HOURS_PER_MONTH = 730;

/**
 * Per-period cost → monthly cost, same factors as apps/backend/src/common/money.ts
 * (kept as plain numbers: this value is only compared, never displayed).
 * onetime → 0, matching the analytics treatment of capital expenses.
 */
export function monthlyAmount(cost: string, period: Period): number {
  const c = Number(cost);
  switch (period) {
    case 'monthly':
      return c;
    case 'yearly':
      return c / 12;
    case 'quarterly':
      return c / 3;
    case 'daily':
      return c * (HOURS_PER_MONTH / 24);
    case 'hourly':
      return c * HOURS_PER_MONTH;
    default:
      return 0;
  }
}

/** Decimal string → integer cents, rounded half away from zero; null for non-numbers. */
function toCents(value: string): bigint | null {
  const m = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const [, sign, int, frac = ''] = m;
  let cents = BigInt(int) * 100n + BigInt(`${frac}00`.slice(0, 2));
  if (Number(frac[2] ?? '0') >= 5) cents += 1n;
  return sign ? -cents : cents;
}

function fromCents(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Round a decimal string to 2 places exactly ("12.345" → "12.35"); non-numbers pass through. */
export function roundMoney(value: string): string {
  const c = toCents(value);
  return c == null ? value : fromCents(c);
}

/**
 * Exact sum of decimal strings, each rounded to cents first — so a caption total always equals
 * the sum of the parts as displayed (floats would drift by a cent).
 */
export function sumMoney(values: string[]): string {
  let total = 0n;
  for (const v of values) total += toCents(v) ?? 0n;
  return fromCents(total);
}
