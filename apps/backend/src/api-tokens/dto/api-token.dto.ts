import { createZodDto } from 'nestjs-zod';
import { apiTokenSchema, createApiTokenSchema, createdApiTokenSchema } from '@infra/shared';

export class CreateApiTokenDto extends createZodDto(createApiTokenSchema) {}

export class ApiTokenDto extends createZodDto(apiTokenSchema) {}

// Create response — includes the raw token (returned once).
export class CreatedApiTokenDto extends createZodDto(createdApiTokenSchema) {}
