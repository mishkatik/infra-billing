import { z } from 'zod';
import { periodSchema, serviceTypeSchema } from '../enums';
import {
  countryCodeSchema,
  currencySchema,
  isoDateSchema,
  moneySchema,
  uuidSchema,
} from './common';

/** Client-writable display fields merged into service.meta (sync keys untouched). */
export const serviceClientMetaSchema = z.object({
  vendor: z.union([z.string().trim().min(1).max(64), z.null()]).optional(),
  marker: z.union([z.string().trim().min(1).max(64), z.null()]).optional(),
  markerBg: z.union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.null()]).optional(),
});
export type ServiceClientMeta = z.infer<typeof serviceClientMetaSchema>;

export const serviceSchema = z.object({
  uuid: uuidSchema.describe('Service UUID'),
  providerUuid: uuidSchema.describe('Provider UUID'),
  projectUuid: uuidSchema.describe('Project UUID'),
  name: z.string().describe('Service name'),
  description: z.string().describe('Owner note about the service').nullable(),
  type: serviceTypeSchema.describe('Service type'),
  externalId: z.string().describe('ID in provider API').nullable(),
  countryCode: countryCodeSchema.describe('ISO country code').nullable(),
  cost: moneySchema.describe('Cost per period'),
  currency: currencySchema.describe('Cost currency'),
  period: periodSchema.describe('Billing period'),
  nextBillingAt: isoDateSchema.describe('Next billing date').nullable(),
  isActive: z.boolean().describe('Counted in current expenses'),
  isManaged: z.boolean().describe('Auto-synced from provider'),
  costOverridden: z.boolean().describe('Cost edited manually'),
  nameOverridden: z.boolean().describe('Name edited manually'),
  typeOverridden: z.boolean().describe('Type edited manually'),
  meta: z.record(z.string(), z.unknown()).describe('Raw provider fields'),
  paymentsCount: z.number().int().nonnegative().describe('Number of payments').optional(),
  createdAt: isoDateSchema.describe('Creation timestamp'),
  updatedAt: isoDateSchema.describe('Last update timestamp'),
});
export type Service = z.infer<typeof serviceSchema>;

export const createServiceSchema = z.object({
  providerUuid: uuidSchema.describe('Provider UUID'),
  projectUuid: uuidSchema.describe('Project UUID'),
  name: z.string().min(1).describe('Service name'),
  description: z.string().trim().max(500).describe('Owner note about the service').optional(),
  type: serviceTypeSchema.describe('Service type'),
  cost: moneySchema.describe('Cost per period'),
  currency: currencySchema.describe('Cost currency'),
  period: periodSchema.describe('Billing period'),
  countryCode: countryCodeSchema.describe('ISO country code').optional(),
  nextBillingAt: isoDateSchema.describe('Next billing date').optional(),
  isActive: z.boolean().describe('Counted in current expenses').optional(),
  meta: serviceClientMetaSchema.describe('Display marker fields').optional(),
});
export type CreateService = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  // Only honoured for manual services. Moving a synced one would orphan it from sync.
  providerUuid: uuidSchema.describe('Provider UUID').optional(),
  // Reassign the service to another project (honoured for synced services too).
  projectUuid: uuidSchema.describe('Project UUID').optional(),
  name: z.string().min(1).describe('Service name').optional(),
  description: z
    .string()
    .trim()
    .max(500)
    .describe('Owner note about the service')
    .nullable()
    .optional(),
  type: serviceTypeSchema.describe('Service type').optional(),
  cost: moneySchema.describe('Cost per period').optional(),
  currency: currencySchema.describe('Cost currency').optional(),
  period: periodSchema.describe('Billing period').optional(),
  countryCode: countryCodeSchema.describe('ISO country code').nullable().optional(),
  nextBillingAt: isoDateSchema.describe('Next billing date').nullable().optional(),
  isActive: z.boolean().describe('Counted in current expenses').optional(),
  meta: serviceClientMetaSchema.describe('Display marker fields').optional(),
});
export type UpdateService = z.infer<typeof updateServiceSchema>;
