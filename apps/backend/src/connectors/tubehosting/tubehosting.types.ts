import { z } from 'zod';

// Tube-Hosting has no public API docs: the shapes below are what the panel's own JSON API
// (https://api.tube-hosting.com, used by cp.tube-hosting.com) returns, limited to the fields
// the connector reads. Money is in euro cents.

export interface TubeHostingCredentials {
  username: string; // account email
  password: string;
  totpSecret?: string; // base32 seed, only if authenticator-app 2FA is confirmed on the account
}

const cents = z.number().int();

export const tubeHostingTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export const tubeHostingLoginSchema = tubeHostingTokensSchema.extend({
  userData: z.object({
    twoFADevices: z
      .array(z.object({ id: z.number().int(), type: z.string(), confirmed: z.boolean() }))
      .nullish(),
  }),
});

export const tubeHostingMeSchema = z.object({ balance: cents });

export const tubeHostingServiceGroupSchema = z.object({
  id: z.number().int(),
  metaData: z.object({
    name: z.string(),
    status: z.string(),
    runtime: z.string().nullish(), // paid until = next renewal charge
  }),
  groupData: z
    .object({
      price: cents.nullish(),
      runtimeInterval: z.number().int().nullish(), // seconds, 2592000 = 30 days
      services: z.array(
        z.object({
          type: z.string(),
          price: cents.nullish(),
          description: z.string().nullish(),
        }),
      ),
    })
    .nullish(),
});

export const tubeHostingPaymentsPageSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.number().int(),
      time: z.string(),
      payment: z
        .object({
          id: z.number().int(),
          method: z.string().nullish(),
          amount: cents,
          status: z.string(),
          timeFinished: z.string().nullish(),
        })
        .nullish(),
      invoice: z
        .object({
          id: z.number().int(),
          items: z.array(
            z.object({
              position: z.number().int(),
              unitPrice: cents,
              quantity: z.number().int(),
              serviceGroupId: z.number().int().nullish(),
              title: z.string().nullish(),
              description: z.string().nullish(),
            }),
          ),
        })
        .nullish(),
      balanceChange: z.object({ successful: z.boolean().nullish() }).nullish(),
    }),
  ),
});

export type TubeHostingServiceGroup = z.infer<typeof tubeHostingServiceGroupSchema>;
export type TubeHostingPaymentEntry = z.infer<
  typeof tubeHostingPaymentsPageSchema
>['items'][number];
