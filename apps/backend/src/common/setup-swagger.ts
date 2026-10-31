import { INestApplication, LoggerService } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX, CONTROLLERS_INFO } from '@infra/shared';
import { AppConfigService } from '@config/app-config.service';

/**
 * Build the OpenAPI document from the controllers. Always built: the MCP catalog reads operation
 * summaries and schemas from it even when the Swagger UI is off.
 */
export function buildOpenApiDocument(
  app: INestApplication,
  config: AppConfigService,
): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Infra Billing API')
    .setDescription(
      'Personal infrastructure billing panel. Authenticate with a Bearer API token ' +
        '(Settings → API tokens) or the admin session cookie.',
    )
    .setVersion(config.buildInfo.version)
    .addBearerAuth();
  for (const { TAG, DESCRIPTION } of Object.values(CONTROLLERS_INFO))
    builder.addTag(TAG, DESCRIPTION);

  return SwaggerModule.createDocument(app, builder.build());
}

/**
 * Mount the Swagger UI at /api/docs when DOCS=true. swagger-ui-express serves it outside the Nest
 * AuthGuard, so it's public when enabled; bearer requirements come from @ApiBearerAuth on controllers.
 */
export function setupSwagger(
  app: INestApplication,
  document: OpenAPIObject,
  config: AppConfigService,
  logger: LoggerService,
): void {
  if (!config.docs) return;

  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    customSiteTitle: 'Infra Billing API', // browser tab title (instead of the default "Swagger UI")
    // Keep the entered Bearer token across page reloads (localStorage).
    swaggerOptions: { persistAuthorization: true },
  });
  logger.log(`Swagger docs at /${API_PREFIX}/docs`, 'Bootstrap');
}
