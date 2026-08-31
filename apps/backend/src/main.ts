import 'reflect-metadata';
process.title = 'infra-billing';

import { setupSwagger } from '@common/setup-swagger';
import { AppConfigService } from '@config/app-config.service';
import { API_PREFIX } from '@infra/shared';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { patchNestJsSwagger } from 'nestjs-zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';

// Local dev: load the repo-root .env into process.env. Already-set vars (e.g. from
// the Docker container) take precedence, so this is a no-op in production.
const ENV_FILE = join(__dirname, '..', '..', '..', '.env');
if (existsSync(ENV_FILE) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(ENV_FILE);
}

patchNestJsSwagger();

async function bootstrap(): Promise<void> {
  // Buffer early logs until the Nest-provided winston logger is wired in.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  const config = app.get(AppConfigService);

  app.disable('x-powered-by');
  app.use(compression());
  app.use(cookieParser());

  app.setGlobalPrefix(API_PREFIX);

  setupSwagger(app, config, logger);

  // Dev only: the Vite dev server runs on a different origin.
  if (!config.isProd) {
    app.enableCors({ origin: ['http://localhost:5173'], credentials: true });
  }

  if (config.isProd && !config.cookieSecure) {
    logger.warn(
      'COOKIE_SECURE=false: session cookie is sent without Secure — make sure the transport is protected elsewhere',
      'Bootstrap',
    );
  }

  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');

  logger.log(`infra-billing on :${config.port} (${config.env.NODE_ENV})`, 'Bootstrap');
}

void bootstrap();
