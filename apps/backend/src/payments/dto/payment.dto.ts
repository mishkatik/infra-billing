import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createPaymentSchema,
  paginatedPaymentsSchema,
  paymentSchema,
  uuidSchema,
} from '@infra/shared';

export class CreatePaymentDto extends createZodDto(createPaymentSchema) {}

export class PaymentDto extends createZodDto(paymentSchema) {}

export class PaginatedPaymentsDto extends createZodDto(paginatedPaymentsSchema) {}

export const paymentQuerySchema = z.object({
  providerUuid: uuidSchema.optional().describe('Only payments to this provider'),
  accountUuid: uuidSchema.optional().describe('Only payments on this account'),
  serviceUuid: uuidSchema.optional().describe('Only payments for this service'),
  from: z.coerce.date().optional().describe('Payment date on or after (ISO 8601)'),
  to: z.coerce.date().optional().describe('Payment date on or before (ISO 8601)'),
  page: z.coerce.number().int().min(1).default(1).describe('Page number, from 1'),
  pageSize: z.coerce.number().int().min(1).max(200).default(50).describe('Page size'),
});
export class PaymentQueryDto extends createZodDto(paymentQuerySchema) {}
