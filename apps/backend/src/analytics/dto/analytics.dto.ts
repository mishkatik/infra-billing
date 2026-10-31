import {
  accountSpendSchema,
  analyticsSummarySchema,
  balancePointSchema,
  forecastPointSchema,
} from '@infra/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class AnalyticsSummaryDto extends createZodDto(analyticsSummarySchema) {}
export class ForecastPointDto extends createZodDto(forecastPointSchema) {}
export class BalancePointDto extends createZodDto(balancePointSchema) {}
export class AccountSpendDto extends createZodDto(accountSpendSchema) {}

export const forecastQuerySchema = z.object({
  months: z.coerce.number().int().positive().max(60).default(12).describe('Months to forecast'),
  monthsBack: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(24)
    .default(3)
    .describe('Past months of actual spend'),
});
export class ForecastQueryDto extends createZodDto(forecastQuerySchema) {}

export const balanceHistoryQuerySchema = z.object({
  from: z.coerce.date().optional().describe('Snapshots taken on or after (ISO 8601)'),
  to: z.coerce.date().optional().describe('Snapshots taken on or before (ISO 8601)'),
});
export class BalanceHistoryQueryDto extends createZodDto(balanceHistoryQuerySchema) {}
