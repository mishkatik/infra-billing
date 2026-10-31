import { applyDecorators } from '@nestjs/common';
import { ApiQuery, type ApiQueryOptions } from '@nestjs/swagger';
import { zodToOpenAPI } from 'nestjs-zod';
import type { AnyZodObject, ZodRawShape } from 'zod';

/**
 * Document a zod query DTO as separate query parameters. The nestjs-zod Swagger patch only covers
 * bodies, so `@Query() dto` alone leaves the filters out of the OpenAPI document (and the MCP
 * catalog built from it).
 */
export const ApiZodQuery = (schema: AnyZodObject) =>
  applyDecorators(
    ...Object.entries(schema.shape as ZodRawShape).map(([name, field]) =>
      ApiQuery({
        name,
        required: !field.isOptional(),
        schema: zodToOpenAPI(field),
      } as ApiQueryOptions),
    ),
  );
