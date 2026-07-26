import { z } from 'zod';
import { iconBgSchema, iconNameSchema, isoDateSchema, uuidSchema } from './common';

/**
 * The seeded default project. Existing services migrate here, and the sync drops new services here
 * (providers are shared, so a sync can't know the project). It can be renamed but never deleted.
 */
export const DEFAULT_PROJECT_UUID = '00000000-0000-0000-0000-000000000001';

export const projectSchema = z.object({
  uuid: uuidSchema.describe('Project UUID'),
  name: z.string().describe('Project name'),
  faviconLink: z.string().describe('Favicon / logo URL').nullable(),
  // Optional Tabler icon + tile color; when set, overrides faviconLink.
  iconName: iconNameSchema.describe('Tabler icon name').nullable(),
  iconBg: iconBgSchema.describe('Icon tile background').nullable(),
  servicesCount: z.number().int().nonnegative().describe('Number of services').optional(),
  createdAt: isoDateSchema.describe('Creation timestamp'),
  updatedAt: isoDateSchema.describe('Last update timestamp'),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  name: z.string().min(1).describe('Project name'),
  faviconLink: z.string().describe('Favicon / logo URL').optional(),
  iconName: iconNameSchema.describe('Tabler icon name').optional(),
  iconBg: iconBgSchema.describe('Icon tile background').optional(),
});
export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().min(1).describe('Project name').optional(),
  faviconLink: z.string().describe('Favicon / logo URL').nullable().optional(),
  iconName: iconNameSchema.describe('Tabler icon name').nullable().optional(),
  iconBg: iconBgSchema.describe('Icon tile background').nullable().optional(),
});
export type UpdateProject = z.infer<typeof updateProjectSchema>;

/** Result of a bulk service move (Move All / Remove All). */
export const bulkMoveResultSchema = z.object({
  moved: z.number().int().nonnegative().describe('Number of services moved'),
});
export type BulkMoveResult = z.infer<typeof bulkMoveResultSchema>;
