import { z } from 'zod';

// ishosting API (https://api.ishosting.com, spec https://my.ishosting.com/openapi.yaml). Only the
// fields the connector uses are declared: zod strips the rest, so the SSH passwords that
// /vps/{id} and /billing/invoice/{id} return in `access` never reach the mapper, the database or
// the logs. Money is a string with the currency sign ("49.99$", "-2.50$"); timestamps are unix
// seconds. The live API differs from the spec examples: status codes are "Paid" (spec:
// "STATUS_PAID"), period codes are "1m" (spec: "PLAN_PERIOD_MONTH").

const money = z.string().min(1);
const unixSeconds = z.number().int().positive();
const id = z.coerce.string().min(1);
const status = z.object({ code: z.string() });

export const ishostingProfileSchema = z.object({ balance: money });

export const ishostingServicesListSchema = z.array(
  z.object({ type: z.string().min(1), id, name: z.string().nullish() }),
);

const planPeriod = z.object({ code: z.string() }).nullish();
const planCategory = z.object({ name: z.string() }).nullish();

/** GET /{vps,dedicated,storage,vpn}/{id}. */
export const ishostingServiceSchema = z.object({
  id,
  name: z.string().nullish(),
  location: z.object({ code: z.string(), name: z.string().nullish() }).nullish(),
  plan: z.object({
    name: z.string().nullish(),
    code: z.string().nullish(),
    category: planCategory,
    /** List price of the plan with additions, before `discount`. */
    total: money,
    /** Signed promo discount ("-2.50$"), charged on every renewal. */
    discount: money.nullish(),
    period: planPeriod,
    next_charge: unixSeconds.nullish(),
    auto_renew: z.boolean().nullish(),
  }),
  network: z.object({ public_ip: z.string().nullish() }).nullish(),
  status: z
    .object({
      code: z.string().nullish(),
      payment: z.string().nullish(),
      state: z.object({ code: z.string().nullish() }).nullish(),
    })
    .nullish(),
  created_at: unixSeconds.nullish(),
});

/** One row of GET /billing/invoices. */
export const ishostingInvoiceSchema = z.object({
  id,
  invoiced_at: unixSeconds,
  paid_at: unixSeconds.nullish(),
  paid: money.nullish(),
  status,
  services: z.array(z.object({ type: z.string(), service: z.object({ id }) })).nullish(),
});

export const ishostingInvoicesSchema = z.array(ishostingInvoiceSchema);

/** One service line of GET /billing/invoice/{id}: `total` is the line amount after promos. */
export const ishostingInvoiceLineSchema = z.object({
  type: z.string(),
  total: money.nullish(),
  period: z.object({ finish_at: unixSeconds.nullish() }).nullish(),
  service: z.object({
    id,
    plan: z
      .object({
        name: z.string().nullish(),
        code: z.string().nullish(),
        category: planCategory,
        period: planPeriod,
        auto_renew: z.boolean().nullish(),
      })
      .nullish(),
  }),
});

export const ishostingInvoiceDetailSchema = z.object({
  id,
  services: z.array(ishostingInvoiceLineSchema),
});

/**
 * One row of GET /billing/balance/invoices: `income` tops the balance up, `outcome` pays the
 * service invoice `invoice_id` from it.
 */
export const ishostingBalanceInvoiceSchema = z.object({
  id,
  invoiced_at: unixSeconds,
  paid_at: unixSeconds.nullish(),
  total: money,
  type: z.string(),
  invoice_id: id.nullish(),
  status,
});

export const ishostingBalanceInvoicesSchema = z.array(ishostingBalanceInvoiceSchema);

export const ishostingErrorSchema = z.object({ message: z.string().min(1) });

export type IshostingServiceRef = z.infer<typeof ishostingServicesListSchema>[number];
export type IshostingService = z.infer<typeof ishostingServiceSchema>;
export type IshostingInvoice = z.infer<typeof ishostingInvoiceSchema>;
export type IshostingInvoiceLine = z.infer<typeof ishostingInvoiceLineSchema>;
export type IshostingBalanceInvoice = z.infer<typeof ishostingBalanceInvoiceSchema>;
