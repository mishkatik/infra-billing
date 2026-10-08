import { z } from 'zod';
import { syncStatusSchema } from '../enums';
import { isoDateSchema, uuidSchema } from './common';

export const syncRunSchema = z.object({
  id: z.string().describe('Sync run ID'), // BigInt serialized as string
  accountUuid: uuidSchema.describe('Provider account UUID'),
  status: syncStatusSchema.describe('Sync status'),
  servicesFound: z.number().int().describe('Services found count'),
  error: z.string().describe('Sync error message').nullable(),
  startedAt: isoDateSchema.describe('Sync start time'),
  finishedAt: isoDateSchema.describe('Sync finish time').nullable(),
});
export type SyncRun = z.infer<typeof syncRunSchema>;
