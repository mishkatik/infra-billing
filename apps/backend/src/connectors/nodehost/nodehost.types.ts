import { z } from 'zod';

// NodeHost Developer API v1 (https://nodehost.cc/api/v1/docs). Only the fields the connector
// uses are declared: zod strips the rest, so a root password the API returns in the server list
// never reaches the mapper, the database or the logs. Money is a JSON number in USD.

const money = z.number().finite();

export const nodehostUsageSchema = z.object({
  balance: money,
  currency: z.string().nullish(),
});

export const nodehostServerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.string().nullish(), // VPS / VDS / HI_CPU
  status: z.string().nullish(), // ACTIVE / STOPPED / ...
  ip: z.string().nullish(),
  cores: z.number().nullish(),
  ram: z.number().nullish(), // GB
  disk: z.number().nullish(), // GB
  diskType: z.string().nullish(),
  os: z.string().nullish(),
  location: z.string().nullish(), // localized name, e.g. "Germany"
  /** Monthly price including the location markup and the account discount. */
  price: money.nullish(),
  autoRenew: z.boolean().nullish(),
  expiresAt: z.string().nullish(),
  createdAt: z.string().nullish(),
});

export const nodehostServersPageSchema = z.object({
  data: z.array(nodehostServerSchema),
  nextCursor: z.string().nullish(),
});

export const nodehostLocationsSchema = z.array(
  z.object({ name: z.string(), code: z.string().regex(/^[A-Za-z]{2}$/) }),
);

/** `topup` is positive and carries a unique `ref`; `server_charge` is negative with no id. */
export const nodehostBillingEntrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('topup'),
    amount: money,
    at: z.string(),
    ref: z.string().min(1),
    method: z.string().nullish(),
  }),
  z.object({
    type: z.literal('server_charge'),
    amount: money,
    at: z.string(),
    serverId: z.string().min(1),
    name: z.string().nullish(),
  }),
]);

export const nodehostBillingSchema = z.object({ data: z.array(z.unknown()) });

/** Error body: { error: { code, message }, requestId }. */
export const nodehostErrorSchema = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().optional() }),
});

export type NodehostServer = z.infer<typeof nodehostServerSchema>;
export type NodehostBillingEntry = z.infer<typeof nodehostBillingEntrySchema>;
