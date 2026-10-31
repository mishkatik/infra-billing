import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createServiceSchema,
  serviceSchema,
  serviceTypeSchema,
  updateServiceSchema,
  uuidSchema,
} from '@infra/shared';

export class ServiceDto extends createZodDto(serviceSchema) {}
export class CreateServiceDto extends createZodDto(createServiceSchema) {}
export class UpdateServiceDto extends createZodDto(updateServiceSchema) {}

export const serviceQuerySchema = z.object({
  providerUuid: uuidSchema.optional().describe('Only services of this provider'),
  accountUuid: uuidSchema.optional().describe('Only services billed on this account'),
  projectUuid: uuidSchema.optional().describe('Only services in this project'),
  type: serviceTypeSchema.optional().describe('Only services of this type'),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .describe('true: counted in current expenses, false: inactive only'),
});
export class ServiceQueryDto extends createZodDto(serviceQuerySchema) {}
