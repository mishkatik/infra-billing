import { z } from 'zod';
import { uuidSchema } from './common';

// Yandex Cloud scope discovery. Resolves the folders that will be scanned for servers and the
// billing account used for balance / consumption, from the entered authorized key (create flow) or
// from the stored credentials of an existing provider (edit flow). One of `token` / `providerUuid`
// must be present.

export const yandexDiscoverSchema = z
  .object({
    token: z.string().min(1).describe('Authorized key JSON (create flow)').optional(),
    providerUuid: uuidSchema.describe('Existing provider UUID (edit flow)').optional(),
  })
  .refine((v) => Boolean(v.token || v.providerUuid), {
    message: 'Provide the authorized key or an existing provider',
  });
export type YandexDiscover = z.infer<typeof yandexDiscoverSchema>;

export const yandexResourceSchema = z.object({
  id: z.string().describe('Resource id'),
  name: z.string().describe('Display name'),
});
export type YandexResource = z.infer<typeof yandexResourceSchema>;

export const yandexDiscoverResultSchema = z.object({
  folders: z.array(yandexResourceSchema).describe('Folders that will be scanned for servers'),
  billingAccount: yandexResourceSchema
    .nullable()
    .describe('Billing account used for balance / consumption'),
});
export type YandexDiscoverResult = z.infer<typeof yandexDiscoverResultSchema>;
