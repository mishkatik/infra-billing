import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ZodValidationPipe } from 'nestjs-zod';
import { WinstonModule } from 'nest-winston';
import { appLoggerOptions } from '@common/logger';
import { ConfigModule } from '@config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RepositoriesModule } from '@repositories/repositories.module';
import { CryptoModule } from './crypto/crypto.module';
import { FaviconsModule } from './favicons/favicons.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ProvidersModule } from './providers/providers.module';
import { ProjectsModule } from './projects/projects.module';
import { ServicesModule } from './services/services.module';
import { PaymentsModule } from './payments/payments.module';
import { ConnectorsModule } from '@connectors/connectors.module';
import { CurrencyModule } from './currency/currency.module';
import { SyncModule } from './sync/sync.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { ApiTokensModule } from './api-tokens/api-tokens.module';
import { AllExceptionsFilter } from '@common/all-exceptions.filter';

// Built SPA lives at apps/frontend/dist; from compiled backend (apps/backend/dist)
// that is ../../frontend/dist.
const FRONTEND_DIST = join(__dirname, '..', '..', 'frontend', 'dist');

@Module({
  imports: [
    WinstonModule.forRoot(appLoggerOptions()),
    ConfigModule,
    PrismaModule,
    RepositoriesModule,
    CryptoModule,
    FaviconsModule,
    AuthModule,
    ScheduleModule.forRoot(),
    HealthModule,
    ProvidersModule,
    ProjectsModule,
    ServicesModule,
    PaymentsModule,
    ConnectorsModule,
    CurrencyModule,
    SyncModule,
    AnalyticsModule,
    NotificationsModule,
    SettingsModule,
    ApiTokensModule,
    // SPA fallback for all non-API routes.
    ServeStaticModule.forRoot({
      rootPath: FRONTEND_DIST,
      serveStaticOptions: { index: false, fallthrough: true },
      exclude: ['/api/{*path}'],
    }),
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
