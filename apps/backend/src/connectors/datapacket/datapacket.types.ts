import { z } from 'zod';

// Only the fields the connector queries (see datapacket.connector.ts); the GraphQL schema is
// public at https://api.datapacket.com/v0/graphql (introspection) and https://api.datapacket.com.

const currency = z.enum(['USD', 'EUR', 'GBP']);
const money = z.number().finite();

export const datapacketServerSchema = z.object({
  name: z.string().min(1),
  alias: z.string().nullish(),
  hostname: z.string().nullish(),
  deviceType: z.string().nullish(),
  statusV2: z.string().nullish(),
  location: z.object({ name: z.string(), identifier: z.string() }).nullish(),
});

export const datapacketSubscriptionItemSchema = z.object({
  description: z.string().nullish(),
  price: money,
  currency,
  type: z.string(),
  subscriptionItemDetail: z.object({ server: datapacketServerSchema.nullish() }).nullish(),
});

export const datapacketSubscriptionSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  currency,
  billingCycle: z
    .object({
      unit: z.enum(['DAY', 'MONTH', 'YEAR']),
      quantity: z.number().int().positive(),
      start: z.number().int(),
    })
    .nullish(),
  subscriptionItems: z.array(datapacketSubscriptionItemSchema),
});

export const datapacketInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  total: money,
  currency,
  createdAt: z.string(),
  payment: z
    .object({ status: z.string(), paidOn: z.string().nullish(), method: z.string().nullish() })
    .nullish(),
});

/** DataPacket list queries share one pagination envelope (pageSize max 50). */
export function datapacketPageSchema<T extends z.ZodTypeAny>(entry: T) {
  return z.object({
    isLastPage: z.boolean(),
    nextPageIndex: z.number().int().nullish(),
    entries: z.array(entry),
  });
}

export type DatapacketServer = z.infer<typeof datapacketServerSchema>;
export type DatapacketSubscriptionItem = z.infer<typeof datapacketSubscriptionItemSchema>;
export type DatapacketSubscription = z.infer<typeof datapacketSubscriptionSchema>;
export type DatapacketInvoice = z.infer<typeof datapacketInvoiceSchema>;
