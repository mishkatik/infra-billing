import { z } from 'zod';

/** Connector kinds. API-backed: timeweb, hetzner, hostkey, netcup, hostbill, billmgr, selectel, 4vps, netlen, beget, porkbun, spaceship, vultr, linode, aeza, vdsina, cloudflare, stormwall, yandex, doubleservers, openrouter. manual = no sync. */
export const providerKindSchema = z.enum([
  'timeweb',
  'hetzner',
  'hostkey',
  'netcup',
  'hostbill',
  'billmgr',
  'selectel',
  '4vps',
  'netlen',
  'beget',
  'porkbun',
  'spaceship',
  'vultr',
  'linode',
  'aeza',
  'vdsina',
  'cloudflare',
  'stormwall',
  'yandex',
  'doubleservers',
  'openrouter',
  'manual',
]);
export type ProviderKind = z.infer<typeof providerKindSchema>;
export const PROVIDER_KINDS = providerKindSchema.options;

/**
 * Connector kinds that implement `fetchPayments` (payment / charge ledger import on sync).
 * Keep in sync with apps/backend connectors that define that method.
 */
export const PROVIDER_KINDS_WITH_PAYMENT_IMPORT = [
  'hostbill',
  'billmgr',
  'selectel',
  'netlen',
  'linode',
  'aeza',
  'vultr',
  'yandex',
  'vdsina',
  'doubleservers',
  'cloudflare',
] as const satisfies readonly ProviderKind[];

const paymentImportKindSet = new Set<string>(PROVIDER_KINDS_WITH_PAYMENT_IMPORT);

/** Whether this provider kind can import a payment ledger via sync. */
export function providerKindSupportsPaymentImport(kind: string): boolean {
  return paymentImportKindSet.has(kind);
}

/** Built-in presets shown in pickers. API also accepts custom labels (GitLab-style). */
export const SERVICE_TYPES = [
  'vps',
  'dedicated',
  'domain',
  'cdn',
  'storage',
  'db',
  'license',
  'llm',
  'other',
] as const;
export type BuiltinServiceType = (typeof SERVICE_TYPES)[number];

/** Service type: built-in preset or a custom label created in the form. */
export const serviceTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._/-]{0,39}$/u);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

/** Billing period. */
export const periodSchema = z.enum([
  'monthly',
  'yearly',
  'quarterly',
  'daily',
  'hourly',
  'onetime',
]);
export type Period = z.infer<typeof periodSchema>;
export const PERIODS = periodSchema.options;

/** Sync run status. */
export const syncStatusSchema = z.enum(['running', 'ok', 'error']);
export type SyncStatus = z.infer<typeof syncStatusSchema>;

/** Fiat rate source, picked in settings. */
export const rateSourceSchema = z.enum(['cbr', 'manual']);
export type RateSource = z.infer<typeof rateSourceSchema>;

/** What produced a stored rate row. Wider than `rateSourceSchema` — USDT has its own sources. */
export const rateOriginSchema = z.enum(['cbr', 'manual', 'rapira', 'cmc']);
export type RateOrigin = z.infer<typeof rateOriginSchema>;
