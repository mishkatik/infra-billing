import { z } from 'zod';

const money = z.union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)]);
export const netangelsAccountSchema = z.object({ balance: money });
export const netangelsVmSchema = z.object({
  id: z.number().int().positive(),
  uid: z.string().min(1),
  name: z.string(),
  tariff: z.string(),
  state: z.string(),
  main_ip: z.string().nullish(),
  deleted: z.string().nullish(),
  disk: z.object({ size: z.number(), is_backup_enabled: z.boolean() }).passthrough().nullish(),
  ips: z.array(z.object({ ip: z.string(), version: z.number() }).passthrough()).optional(),
});
export const netangelsPageSchema = z.object({
  count: z.number().int().nonnegative(),
  entities: z.array(netangelsVmSchema),
});
export const netangelsCalculationSchema = z.object({
  entities: z.array(
    z.object({
      vm_name: z.string().min(1),
      full_month_price: money,
      full_hour_price: money.optional(),
      month_price: money.optional(),
      packet: z.unknown().optional(),
    }),
  ),
});
export type NetangelsVm = z.infer<typeof netangelsVmSchema>;
export type NetangelsCalculation = z.infer<typeof netangelsCalculationSchema>['entities'][number];
