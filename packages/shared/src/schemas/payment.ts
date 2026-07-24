import { z } from 'zod';
import { currencySchema, isoDateSchema, moneySchema, uuidSchema } from './common';

/** `topup` = пополнение/платёж провайдеру; `charge` = списание за услугу. */
export const paymentTypeSchema = z.enum(['topup', 'charge']);
export type PaymentType = z.infer<typeof paymentTypeSchema>;

export const paymentSchema = z.object({
  uuid: uuidSchema.describe('Payment UUID'),
  providerUuid: uuidSchema.describe('Provider UUID'),
  serviceUuid: uuidSchema.describe('Service UUID').nullable(),
  amount: moneySchema.describe('Payment amount'),
  currency: currencySchema.describe('Currency code'),
  description: z.string().describe('Payment description').nullable(),
  paymentDate: isoDateSchema.describe('Payment date'),
  type: paymentTypeSchema.describe('Payment type'),
  externalId: z.string().describe('Provider record ID').nullable(),
  createdAt: isoDateSchema.describe('Creation timestamp'),
  updatedAt: isoDateSchema.describe('Last update timestamp'),
});
export type Payment = z.infer<typeof paymentSchema>;

/** Paginated payments response (GET /api/payments). */
export const paginatedPaymentsSchema = z.object({
  items: z.array(paymentSchema).describe('Payments on this page'),
  total: z.number().int().nonnegative().describe('Total payments count'),
});
export type PaginatedPayments = z.infer<typeof paginatedPaymentsSchema>;

export const createPaymentSchema = z.object({
  providerUuid: uuidSchema.describe('Provider UUID'),
  serviceUuid: uuidSchema.describe('Service UUID').optional(),
  amount: moneySchema.describe('Payment amount'),
  currency: currencySchema.describe('Currency code'),
  description: z.string().describe('Payment description').optional(),
  paymentDate: isoDateSchema.describe('Payment date'),
  type: paymentTypeSchema.describe('Payment type').optional(),
});
export type CreatePayment = z.infer<typeof createPaymentSchema>;
