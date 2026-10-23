import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/** Currency code: ISO 4217 (RUB / USD / EUR) or a 4-letter crypto ticker (USDT). */
export const currencySchema = z.string().regex(/^[A-Z]{3,4}$/, 'currency code');

/**
 * Supported currencies: UI pickers + the only ones kept from the CBR feed (it publishes ~55 daily).
 * RUB is the CBR base. Edit here to add/remove a currency everywhere.
 * USDT is not a CBR currency — it is priced by Rapira (live) and CoinMarketCap (history).
 */
export const SUPPORTED_CURRENCIES = [
  'RUB',
  'USD',
  'EUR',
  'GBP',
  'CHF',
  'JPY',
  'CNY',
  'TRY',
  'KZT',
  'UAH',
  'USDT',
] as const;

/** Currencies quoted by the CBR feed. */
export const CBR_CURRENCIES = SUPPORTED_CURRENCIES.filter((c) => c !== 'USDT');

/** ISO 3166-1 alpha-2 country code. */
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2');

/**
 * Money is transferred as a decimal STRING to preserve NUMERIC(14,2) precision
 * (never a JS number). E.g. "1234.50".
 */
export const moneySchema = z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'decimal string');

/** ISO 8601 datetime string (UTC). The frontend renders it in local time. */
export const isoDateSchema = z.string().datetime({ offset: true });

/** Time of day as HH:MM (24h), the value of an <input type="time">. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/** IANA time zone the runtime knows (Intl throws a RangeError on anything else). */
export const timeZoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'IANA time zone');

/** Tabler Icons React export name, e.g. IconServer. */
export const iconNameSchema = z
  .string()
  .regex(/^Icon[A-Za-z0-9]+$/, 'Tabler icon name')
  .max(64);

/** Solid hex background for a custom Tabler icon tile. */
export const iconBgSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'hex color #RRGGBB');

/** An amount in a given currency (e.g. one entry of a per-currency balance sum). */
export const moneyAmountSchema = z.object({
  amount: moneySchema.describe('Amount'),
  currency: currencySchema.describe('Currency code'),
});
export type MoneyAmount = z.infer<typeof moneyAmountSchema>;
