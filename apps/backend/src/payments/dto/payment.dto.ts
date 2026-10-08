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
  providerUuid: uuidSchema.optional(),
  accountUuid: uuidSchema.optional(),
  serviceUuid: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export class PaymentQueryDto extends createZodDto(paymentQuerySchema) {}
