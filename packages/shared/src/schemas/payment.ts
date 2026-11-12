import { z } from 'zod';
import { currencySchema, isoDateSchema, moneySchema, uuidSchema } from './common';

/** `topup` = пополнение/платёж провайдеру; `charge` = списание за услугу. */
export const paymentTypeSchema = z.enum(['topup', 'charge']);
export type PaymentType = z.infer<typeof paymentTypeSchema>;

export const paymentSchema = z.object({
  uuid: uuidSchema.describe('Payment UUID'),
  providerUuid: uuidSchema.describe('Provider UUID'),
  accountUuid: uuidSchema.describe('Provider account UUID'),
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

export const createPaymentSchema = z
  .object({
    // The account the payment went to. A bare providerUuid is still accepted when that provider
    // has exactly one account (older API clients).
    accountUuid: uuidSchema.describe('Provider account UUID').optional(),
    providerUuid: uuidSchema.describe('Provider UUID (single-account providers)').optional(),
    serviceUuid: uuidSchema.describe('Service UUID').optional(),
    amount: moneySchema.describe('Payment amount'),
    currency: currencySchema.describe('Currency code'),
    description: z.string().describe('Payment description').optional(),
    paymentDate: isoDateSchema.describe('Payment date'),
    type: paymentTypeSchema.describe('Payment type').optional(),
  })
  .refine((v) => Boolean(v.accountUuid || v.providerUuid), {
    message: 'Provide the account (or a single-account provider)',
  });
export type CreatePayment = z.infer<typeof createPaymentSchema>;

// How far apart a manual payment and its imported twin may be dated: a hand-entered date is often
// the day the owner noticed the payment, not the day it settled.
export const DUPLICATE_PAYMENT_WINDOW_DAYS = 3;

/**
 * A manually entered payment that an import has since brought in as well: same account, type,
 * currency and amount, dated within DUPLICATE_PAYMENT_WINDOW_DAYS
 * (GET /api/provider-accounts/{uuid}/duplicate-payments).
 */
export const duplicatePaymentSchema = z.object({
  manual: paymentSchema.describe('Manually entered payment (the one to remove)'),
  imported: paymentSchema.describe('Imported payment it duplicates'),
});
export type DuplicatePayment = z.infer<typeof duplicatePaymentSchema>;

export const duplicatePaymentsSchema = z.object({
  items: z.array(duplicatePaymentSchema).describe('Duplicate pairs, newest first'),
});
export type DuplicatePayments = z.infer<typeof duplicatePaymentsSchema>;

export const removeDuplicatePaymentsSchema = z.object({
  paymentUuids: z
    .array(uuidSchema)
    .min(1)
    .max(1000)
    .describe('Manual payments to remove; ones that are no longer duplicates are skipped'),
});
export type RemoveDuplicatePayments = z.infer<typeof removeDuplicatePaymentsSchema>;

export const removeDuplicatePaymentsResultSchema = z.object({
  deleted: z.number().int().nonnegative().describe('Manual payments removed'),
});
export type RemoveDuplicatePaymentsResult = z.infer<typeof removeDuplicatePaymentsResultSchema>;
