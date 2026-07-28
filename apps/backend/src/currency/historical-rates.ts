import Decimal from 'decimal.js';

export interface DailyRateRow {
  code: string;
  day: string; // YYYY-MM-DD
  rate: Decimal; // RUB per 1 unit
}

/** UTC calendar day — payment dates are stored in UTC, so the local date must not be used. */
export const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

interface CodeSeries {
  days: string[];
  rates: Decimal[];
}

/**
 * Date-indexed RUB rates for valuing past spend. Lookup is "newest day <= target", never an
 * exact match — CBR skips Sundays and Mondays, and holidays leave gaps of a fortnight. Seeded
 * from the live map so a currency missing from the archive still converts at today's rate
 * rather than passing through unconverted.
 */
export class HistoricalRates {
  private readonly byCode = new Map<string, CodeSeries>();
  private readonly cache = new Map<string, Map<string, Decimal>>();

  constructor(
    rows: DailyRateRow[],
    private readonly latest: Map<string, Decimal>,
  ) {
    // Rows arrive oldest-first; keep that order for the binary search.
    for (const r of rows) {
      let series = this.byCode.get(r.code);
      if (!series) {
        series = { days: [], rates: [] };
        this.byCode.set(r.code, series);
      }
      series.days.push(r.day);
      series.rates.push(r.rate);
    }
  }

  /** True when no archive was loaded. */
  get isEmpty(): boolean {
    return this.byCode.size === 0;
  }

  /** Rate map as it stood on `date`, shaped like `getRubRates()`. */
  ratesOn(date: Date): Map<string, Decimal> {
    const key = utcDay(date);
    const hit = this.cache.get(key);
    if (hit) return hit;

    const map = new Map(this.latest);
    for (const [code, series] of this.byCode) {
      const rate = asOf(series, key);
      if (rate) map.set(code, rate);
    }
    this.cache.set(key, map);
    return map;
  }
}

/** Newest rate on or before `day`; falls back to the oldest known one for earlier dates. */
function asOf(series: CodeSeries, day: string): Decimal | undefined {
  const { days, rates } = series;
  if (days.length === 0) return undefined;
  if (day < days[0]) return rates[0]; // predates the archive → nearest later

  let lo = 0;
  let hi = days.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] <= day) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return rates[found];
}
