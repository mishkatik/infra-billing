import { z } from 'zod';

// Gcore (https://api.gcore.com). The documented Billing API (/billing/org/v1) is for resellers and
// answers 403 to a regular account; the account's own billing lives under /billing/client/v1 and
// /billing/v1/clients/me (same shapes, used by the customer portal). Only fields we read are typed.

const money = z.union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)]);

export const gcoreClientMeSchema = z.object({
  balances: z.array(z.object({ amount: money, currency: z.string() })),
});

export const gcoreOperationSchema = z.object({
  id: z.string(),
  acc: z.string(),
  unit_code: z.string(), // e.g. "currency.EUR"
  debit: money.nullish(),
  credit: money.nullish(),
  analytics: z.record(z.string(), z.unknown()).nullish(),
  action: z.object({
    id: z.string(),
    applying_at: z.string(),
    type_code: z.string(),
    deleted: z.boolean().nullish(),
    object_id: z.string().nullish(),
    details_json: z.unknown(),
  }),
});

export const gcoreOperationsPageSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(gcoreOperationSchema),
});

// details_json of `expense.create` / `payment.paid` (other keys ignored).
export const gcoreExpenseDetailsSchema = z.object({
  feature: z.object({ id: z.number().int(), name_en: z.string().nullish() }),
  product: z.object({ internal_name: z.string().nullish() }).nullish(),
});
export const gcorePaymentDetailsSchema = z.object({ description: z.string().nullish() });

export const gcoreCostRowSchema = z.object({
  region_id: z.number().int().nullish(),
  project_id: z.number().int().nullish(),
  resource: z.object({
    type: z.string(),
    uuid: z.string().nullish(),
    name: z.string().nullish(),
    flavor: z.string().nullish(),
  }),
  usage: z.object({
    first_seen: z.string().nullish(),
    last_seen: z.string().nullish(),
    cost: money.nullish(),
    currency: z.string().nullish(),
  }),
});
export const gcoreCostReportSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(gcoreCostRowSchema),
});

// v1 cost report (deprecated) is only read for `attached_to_vm`, which v2 dropped.
export const gcoreAttachmentReportSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(
    z
      .object({
        type: z.string(),
        uuid: z.string().nullish(),
        ip_address: z.string().nullish(),
        attached_to_vm: z.string().nullish(),
      })
      .passthrough(),
  ),
});

export const gcoreRegionsSchema = z.object({
  results: z.array(z.object({ id: z.number().int(), country: z.string().nullish() })),
});

export type GcoreOperation = z.infer<typeof gcoreOperationSchema>;
export type GcoreCostRow = z.infer<typeof gcoreCostRowSchema>;
