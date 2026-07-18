import { z } from 'zod';

/** Connector kinds. API-backed: timeweb, hetzner, netcup, hostbill, billmgr, selectel, 4vps, netlen, beget, porkbun, vultr, linode, aeza, vdsina, cloudflare, stormwall, yandex. manual = no sync. */
export const providerKindSchema = z.enum([
  'timeweb',
  'hetzner',
  'netcup',
  'hostbill',
  'billmgr',
  'selectel',
  '4vps',
  'netlen',
  'beget',
  'porkbun',
  'vultr',
  'linode',
  'aeza',
  'vdsina',
  'cloudflare',
  'stormwall',
  'yandex',
  'manual',
]);
export type ProviderKind = z.infer<typeof providerKindSchema>;
export const PROVIDER_KINDS = providerKindSchema.options;

/** Service (resource) type. */
export const serviceTypeSchema = z.enum([
  'vps',
  'dedicated',
  'domain',
  'cdn',
  'storage',
  'db',
  'license',
  'other',
]);
export type ServiceType = z.infer<typeof serviceTypeSchema>;
export const SERVICE_TYPES = serviceTypeSchema.options;

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

/** Exchange-rate source. */
export const rateSourceSchema = z.enum(['cbr', 'manual']);
export type RateSource = z.infer<typeof rateSourceSchema>;
