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
  providerUuid: uuidSchema.optional(),
  accountUuid: uuidSchema.optional(),
  projectUuid: uuidSchema.optional(),
  type: serviceTypeSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export class ServiceQueryDto extends createZodDto(serviceQuerySchema) {}
