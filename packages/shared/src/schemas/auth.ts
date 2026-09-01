import { z } from 'zod';
import { permissionSchema } from './account';
import { uuidSchema } from './common';

export const loginSchema = z.object({
  username: z.string().min(1).describe('Owner username'),
  password: z.string().min(1).describe('Owner password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const meSchema = z.object({
  username: z.string().describe('Logged-in username'),
  role: z.enum(['admin', 'member']).describe('Principal role'),
  permissions: z.array(permissionSchema).describe('Granted permissions (empty for admin)'),
  // null = unrestricted (admin); members always carry an explicit list.
  projectUuids: z.array(uuidSchema).describe('Accessible projects').nullable(),
});
export type Me = z.infer<typeof meSchema>;

// First-run / login-page bootstrap (public). Drives the setup-vs-login screen and which
// methods to render.
export const setupStatusSchema = z.object({
  needsSetup: z.boolean().describe('First-run setup required'),
  passwordEnabled: z.boolean().describe('Owner password login enabled'),
  passkeyEnabled: z.boolean().describe('Owner passkey login enabled'),
  memberPasswordLogin: z.boolean().describe('Member password login available'),
  memberPasskeys: z.boolean().describe('Member passkeys registered'),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;

// First-run account creation (public, only when needsSetup).
export const setupSchema = z.object({
  username: z.string().min(1).max(64).describe('New owner username'),
  password: z.string().min(8).max(128).describe('New owner password'),
});
export type SetupInput = z.infer<typeof setupSchema>;

// Authenticated auth configuration (GET /auth/config). Never includes hash or secret.
export const authConfigSchema = z.object({
  username: z.string().describe('Owner username'),
  passwordEnabled: z.boolean().describe('Owner password login enabled'),
  passkeyEnabled: z.boolean().describe('Owner passkey login enabled'),
  rpId: z.string().describe('Relying Party ID'),
  rpName: z.string().describe('Relying Party name'),
  rpOrigin: z.string().describe('Relying Party origin'),
});
export type AuthConfig = z.infer<typeof authConfigSchema>;

// Username is set once at setup and is immutable afterwards. It's intentionally not updatable here.
export const updateAuthConfigSchema = z.object({
  passwordEnabled: z.boolean().describe('Enable owner password login').optional(),
  passkeyEnabled: z.boolean().describe('Enable owner passkey login').optional(),
  // Owner-set Relying Party config. Bounded to keep the singleton row sane; format isn't enforced
  // (a bad value only breaks the owner's own passkey ceremonies, fixable in the same screen).
  rpId: z.string().max(253).describe('Relying Party ID').optional(),
  rpName: z.string().max(128).describe('Relying Party name').optional(),
  rpOrigin: z.string().max(2048).describe('Relying Party origin').optional(),
});
export type UpdateAuthConfig = z.infer<typeof updateAuthConfigSchema>;

// A registered passkey, as listed in the settings tab (no public key / secrets).
export const passkeySchema = z.object({
  uuid: z.string().describe('Passkey UUID'),
  name: z.string().describe('Passkey name').nullable(),
  deviceType: z.string().describe('Authenticator device type').nullable(),
  backedUp: z.boolean().describe('Credential backed up'),
  createdAt: z.string().describe('Registration timestamp'),
  lastUsedAt: z.string().describe('Last used timestamp').nullable(),
});
export type Passkey = z.infer<typeof passkeySchema>;
