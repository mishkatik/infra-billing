import { z } from 'zod';
import { isoDateSchema, uuidSchema } from './common';

// Persistent/list shape. Only a masked prefix is exposed — the raw token is never returned after
// creation (only its SHA-256 hash is stored).
export const apiTokenSchema = z.object({
  uuid: uuidSchema.describe('API token UUID'),
  tokenName: z.string().describe('Token display name'),
  tokenPrefix: z.string().describe('Masked token prefix'),
  lastUsedAt: isoDateSchema.describe('Last used timestamp').nullable(),
  createdAt: isoDateSchema.describe('Creation timestamp'),
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

// Create-only response: carries the raw token exactly once (the only time it's ever returned).
export const createdApiTokenSchema = apiTokenSchema.extend({
  token: z.string().describe('Raw token — shown once, not recoverable later'),
});
export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>;

export const createApiTokenSchema = z.object({
  tokenName: z.string().min(1).describe('Token display name'),
});
export type CreateApiToken = z.infer<typeof createApiTokenSchema>;
