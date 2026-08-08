import { z } from 'zod';
import { providerKindSchema } from '../enums';
import {
  currencySchema,
  iconBgSchema,
  iconNameSchema,
  isoDateSchema,
  moneySchema,
  uuidSchema,
} from './common';

/** Provider as returned by the API. The API token is NEVER returned. */
export const providerSchema = z.object({
  uuid: uuidSchema.describe('Provider UUID'),
  name: z.string().describe('Display name'),
  kind: providerKindSchema.describe('Connector kind'),
  faviconLink: z.string().describe('Favicon URL').nullable(),
  loginUrl: z.string().describe('Control panel URL').nullable(),
  // Optional Tabler icon + tile color; when set, overrides favicon derived from loginUrl.
  iconName: iconNameSchema.describe('Tabler icon name').nullable(),
  iconBg: iconBgSchema.describe('Icon tile background').nullable(),
  balance: moneySchema.describe('Account balance').nullable(),
  balanceCurrency: currencySchema.describe('Balance currency').nullable(),
  // Invoice-billed (postpaid): balance is not prepaid funds → excluded from balance warnings.
  isPostpaid: z.boolean().describe('Invoice-billed / postpaid'),
  balanceSyncedAt: isoDateSchema.describe('Balance update time').nullable(),
  lastSyncAt: isoDateSchema.describe('Last successful sync').nullable(),
  lastSyncError: z.string().describe('Last sync error').nullable(),
  servicesCount: z.number().int().nonnegative().describe('Number of services').optional(),
  paymentsCount: z.number().int().nonnegative().describe('Number of payments').optional(),
  // Non-secret credential hints (hostbill/billmgr/selectel/4vps/vdsina/aeza) so the edit form can
  // prefill them.
  // Plaintext secrets are NEVER returned here — only presence flags for the edit form mask.
  baseUrl: z.string().describe('API base URL').nullable().optional(),
  username: z.string().describe('Account username').nullable().optional(),
  accountId: z.string().describe('Selectel account number').nullable().optional(),
  projectName: z.string().describe('Cloud project name').nullable().optional(),
  panelId: z.string().describe('Billing panel id').nullable().optional(),
  hasToken: z.boolean().describe('Stored API token / key present').optional(),
  hasPassword: z.boolean().describe('Stored account password present').optional(),
  hasTotpSecret: z.boolean().describe('Stored TOTP secret present').optional(),
  hasApiPassword: z.boolean().describe('Stored API password present').optional(),
  hasSecretKey: z.boolean().describe('Stored secret API key present').optional(),
  useCatalogNames: z.boolean().describe('OpenRouter: use catalog display names').optional(),
  createdAt: isoDateSchema.describe('Creation time'),
  updatedAt: isoDateSchema.describe('Last update time'),
});
export type Provider = z.infer<typeof providerSchema>;

/** Plaintext secrets from an explicit reveal. Not included in list/detail responses. */
export const providerCredentialsRevealSchema = z.object({
  token: z.string().optional(),
  password: z.string().optional(),
  totpSecret: z.string().optional(),
  apiPassword: z.string().optional(),
  secretKey: z.string().optional(),
});
export type ProviderCredentialsReveal = z.infer<typeof providerCredentialsRevealSchema>;

// Bearer/API-token providers (timeweb, hetzner, vdsina) use `token`. HostBill/BILLmanager use
// `baseUrl` + `username` (email) + `password`. BILLmanager with OTP 2FA additionally
// takes `totpSecret` (the base32 seed) so the backend can generate one-time codes.
// Beget uses `username` (account login) + `password` (Cloud API), plus optional `totpSecret`
// (OTP 2FA) and `apiPassword` (the separate panel API password, enables the balance lookup).
// Double Servers uses `username` (email) + `password`, plus optional `totpSecret` (OTP 2FA).
// None are ever echoed back.
const credentialFields = {
  token: z.string().min(1).describe('API token').optional(),
  baseUrl: z.string().url().describe('API base URL').optional(),
  username: z.string().min(1).describe('Account username').optional(),
  password: z.string().min(1).describe('Account password').optional(),
  totpSecret: z.string().min(1).describe('TOTP secret seed').optional(),
  // Selectel: account number (Keystone domain) for the service user, and the optional Cloud
  // Platform project name (enables cloud/OpenStack server listing).
  accountId: z.string().min(1).describe('Selectel account number').optional(),
  projectName: z.string().min(1).describe('Cloud project name').optional(),
  // 4VPS: panel id (which billing panel the API key belongs to). Combined with `token`.
  panelId: z.string().min(1).describe('Billing panel id').optional(),
  // Beget: the separate panel "Beget API" password (legacy hosting API). Enables balance sync.
  apiPassword: z.string().min(1).describe('Beget API password').optional(),
  // Porkbun: the secret API key, paired with `token` (the API key).
  secretKey: z.string().min(1).describe('Secret API key').optional(),
  useCatalogNames: z.boolean().describe('OpenRouter: use catalog display names').optional(),
};

export const createProviderSchema = z.object({
  name: z.string().min(1).describe('Display name'),
  kind: providerKindSchema.describe('Connector kind'),
  loginUrl: z.string().url().describe('Control panel URL').optional(),
  iconName: iconNameSchema.describe('Tabler icon name').optional(),
  iconBg: iconBgSchema.describe('Icon tile background').optional(),
  isPostpaid: z.boolean().describe('Invoice-billed / postpaid').optional(),
  ...credentialFields,
});
export type CreateProvider = z.infer<typeof createProviderSchema>;

export const updateProviderSchema = z.object({
  name: z.string().min(1).describe('Display name').optional(),
  loginUrl: z.string().url().describe('Control panel URL').nullable().optional(),
  iconName: iconNameSchema.describe('Tabler icon name').nullable().optional(),
  iconBg: iconBgSchema.describe('Icon tile background').nullable().optional(),
  isPostpaid: z.boolean().describe('Invoice-billed / postpaid').optional(),
  ...credentialFields,
});
export type UpdateProvider = z.infer<typeof updateProviderSchema>;
