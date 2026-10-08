import { createZodDto } from 'nestjs-zod';
import {
  createProviderAccountSchema,
  providerAccountSchema,
  updateProviderAccountSchema,
} from '@infra/shared';

export class ProviderAccountDto extends createZodDto(providerAccountSchema) {}
export class CreateProviderAccountDto extends createZodDto(createProviderAccountSchema) {}
export class UpdateProviderAccountDto extends createZodDto(updateProviderAccountSchema) {}
