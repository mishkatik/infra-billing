import {
  analyticsProjectsQuerySchema,
  analyticsSummarySchema,
  balancePointSchema,
  forecastPointSchema,
} from '@infra/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class AnalyticsSummaryDto extends createZodDto(analyticsSummarySchema) {}
export class ForecastPointDto extends createZodDto(forecastPointSchema) {}
export class BalancePointDto extends createZodDto(balancePointSchema) {}

export class SummaryQueryDto extends createZodDto(analyticsProjectsQuerySchema) {}

export const forecastQuerySchema = z.object({
  months: z.coerce.number().int().positive().max(60).default(12),
  monthsBack: z.coerce.number().int().nonnegative().max(24).default(3),
});
export class ForecastQueryDto extends createZodDto(
  forecastQuerySchema.merge(analyticsProjectsQuerySchema),
) {}

export const balanceHistoryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export class BalanceHistoryQueryDto extends createZodDto(balanceHistoryQuerySchema) {}
