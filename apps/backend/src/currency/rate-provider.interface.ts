import type Decimal from 'decimal.js';

export interface RateQuote {
  code: string; // ISO 4217
  perRub: Decimal; // RUB per 1 unit of `code`
}

export interface RateSnapshot {
  /** Effective date, `YYYY-MM-DD`. Not the fetch date — CBR publishes a day ahead. */
  day: string;
  quotes: RateQuote[];
}

/** Pluggable exchange-rate source (CBR works in RUB). */
export interface RateProvider {
  source(): string; // "cbr" | "manual"
  fetchRates(signal: AbortSignal): Promise<RateSnapshot>;
}

/** One day of history. `day` is a UTC calendar date, `YYYY-MM-DD`. */
export interface DailyQuote {
  day: string;
  rate: Decimal; // RUB per 1 unit
}
