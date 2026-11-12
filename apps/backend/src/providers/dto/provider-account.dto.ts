import { createZodDto } from 'nestjs-zod';
import {
  createProviderAccountSchema,
  duplicatePaymentsSchema,
  providerAccountSchema,
  removeDuplicatePaymentsResultSchema,
  removeDuplicatePaymentsSchema,
  updateProviderAccountSchema,
} from '@infra/shared';

export class ProviderAccountDto extends createZodDto(providerAccountSchema) {}
export class CreateProviderAccountDto extends createZodDto(createProviderAccountSchema) {}
export class UpdateProviderAccountDto extends createZodDto(updateProviderAccountSchema) {}
export class DuplicatePaymentsDto extends createZodDto(duplicatePaymentsSchema) {}
export class RemoveDuplicatePaymentsDto extends createZodDto(removeDuplicatePaymentsSchema) {}
export class RemoveDuplicatePaymentsResultDto extends createZodDto(
  removeDuplicatePaymentsResultSchema,
) {}
