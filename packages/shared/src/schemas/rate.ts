import { z } from 'zod';
import { rateOriginSchema } from '../enums';
import { currencySchema, isoDateSchema } from './common';

/** Exchange-rate value: RUB per 1 unit of `code`. Decimal string (≤8 dp). */
export const rateValueSchema = z.string().regex(/^\d+(\.\d{1,8})?$/, 'positive decimal string');

export const rateSchema = z.object({
  code: currencySchema.describe('Currency code'),
  base: currencySchema.describe('Base currency code'),
  rate: rateValueSchema.describe('RUB per unit'),
  source: rateOriginSchema.describe('Rate source'),
  capturedAt: isoDateSchema.describe('Capture timestamp'),
});
export type Rate = z.infer<typeof rateSchema>;

/** Result of a historical-rate backfill run. */
export const rateBackfillSchema = z.object({
  inserted: z.number().int().describe('Daily rate rows inserted'),
  from: z.string().describe('First date covered (YYYY-MM-DD)'),
  to: z.string().describe('Last date covered (YYYY-MM-DD)'),
  failed: z.array(z.string()).describe('Currencies whose backfill failed'),
});
export type RateBackfill = z.infer<typeof rateBackfillSchema>;

/** Manual rate entry (RUB per 1 unit of `code`). */
export const createRateSchema = z.object({
  code: currencySchema.describe('Currency code'),
  rate: rateValueSchema.describe('RUB per unit'),
});
export type CreateRate = z.infer<typeof createRateSchema>;
