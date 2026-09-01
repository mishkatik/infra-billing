import { z } from 'zod';
import { uuidSchema } from './common';

// Permission matrix: 4 areas × read/edit (dashboard is read-only). Everything not
// covered by a permission is admin-only.
export const PERMISSIONS = [
  'dashboard:read',
  'services:read',
  'services:edit',
  'providers:read',
  'providers:edit',
  'payments:read',
  'payments:edit',
] as const;
export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

export const accountSchema = z.object({
  uuid: uuidSchema.describe('Account UUID'),
  username: z.string().nullable().describe('Account username (null while pending invite claim)'),
  permissions: z.array(permissionSchema).describe('Granted permissions'),
  projectUuids: z.array(uuidSchema).describe('Accessible project UUIDs'),
  disabled: z.boolean().describe('Login disabled'),
  pending: z.boolean().describe('Awaiting invite/reset claim'),
  hasPasskeys: z.boolean().describe('Account has registered passkeys'),
  createdAt: z.string().describe('Creation timestamp'),
});
export type Account = z.infer<typeof accountSchema>;

export const createAccountSchema = z.object({
  username: z.string().min(1).max(64).describe('Account username'),
  password: z.string().min(8).max(128).describe('Initial password'),
  permissions: z.array(permissionSchema).describe('Granted permissions'),
  projectUuids: z.array(uuidSchema).describe('Accessible project UUIDs'),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  password: z.string().min(8).max(128).describe('New password (admin reset)').optional(),
  permissions: z.array(permissionSchema).describe('Granted permissions').optional(),
  projectUuids: z.array(uuidSchema).describe('Accessible project UUIDs').optional(),
  disabled: z.boolean().describe('Login disabled').optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// Invite/reset by one-time link: the admin never has to hand out a password. Creating an
// account by invite leaves username+password to the invitee; reissuing a link on an existing
// account resets its password (old one stops working immediately).

export const createInviteSchema = z.object({
  permissions: z.array(permissionSchema).describe('Granted permissions'),
  projectUuids: z.array(uuidSchema).describe('Accessible project UUIDs'),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const createdInviteSchema = z.object({
  uuid: uuidSchema.describe('Pending account UUID'),
  token: z.string().describe('One-time invite token — shown once, never recoverable'),
  expiresAt: z.string().describe('Token expiry timestamp'),
});
export type CreatedInvite = z.infer<typeof createdInviteSchema>;

export const resetLinkSchema = z.object({
  token: z.string().describe('One-time invite/reset token — shown once, never recoverable'),
  expiresAt: z.string().describe('Token expiry timestamp'),
});
export type ResetLink = z.infer<typeof resetLinkSchema>;

export const inviteModeSchema = z.enum(['invite', 'reset']);
export type InviteMode = z.infer<typeof inviteModeSchema>;

export const inviteInfoSchema = z.object({
  mode: inviteModeSchema.describe('"invite" sets up a new account, "reset" changes a password'),
  username: z.string().nullable().describe('Existing username (reset mode) or null (invite mode)'),
});
export type InviteInfo = z.infer<typeof inviteInfoSchema>;

export const claimInviteSchema = z.object({
  username: z.string().min(1).max(64).describe('Chosen username (invite mode only)').optional(),
  password: z.string().min(8).max(128).describe('New password'),
});
export type ClaimInviteInput = z.infer<typeof claimInviteSchema>;
