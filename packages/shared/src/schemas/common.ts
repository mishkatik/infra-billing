import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/** ISO 4217 currency code, e.g. RUB / USD / EUR. */
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 currency code');

/**
 * Supported currencies: UI pickers + the only ones kept from the CBR feed (it publishes ~55 daily).
 * RUB is the CBR base. Edit here to add/remove a currency everywhere.
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
] as const;

/** ISO 3166-1 alpha-2 country code. */
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2');

/**
 * Money is transferred as a decimal STRING to preserve NUMERIC(14,2) precision
 * (never a JS number). E.g. "1234.50".
 */
export const moneySchema = z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'decimal string');

/** ISO 8601 datetime string (UTC). The frontend renders it in local time. */
export const isoDateSchema = z.string().datetime({ offset: true });

/** Tabler Icons React export name, e.g. IconServer. */
export const iconNameSchema = z
  .string()
  .regex(/^Icon[A-Za-z0-9]+$/, 'Tabler icon name')
  .max(64);

/** Solid hex background for a custom Tabler icon tile. */
export const iconBgSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'hex color #RRGGBB');
