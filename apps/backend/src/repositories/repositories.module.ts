import { Global, Module } from '@nestjs/common';
import { ApiTokensRepository } from './api-tokens/api-tokens.repository';
import { AuthConfigRepository } from './auth-config/auth-config.repository';
import { BalanceSnapshotsRepository } from './balance-snapshots/balance-snapshots.repository';
import { ExchangeRatesRepository } from './exchange-rates/exchange-rates.repository';
import { ExchangeRatesDailyRepository } from './exchange-rates-daily/exchange-rates-daily.repository';
import { NotificationLogRepository } from './notification-log/notification-log.repository';
import { PasskeysRepository } from './passkeys/passkeys.repository';
import { PaymentsRepository } from './payments/payments.repository';
import { ProjectsRepository } from './projects/projects.repository';
import { ProvidersRepository } from './providers/providers.repository';
import { ServicesRepository } from './services/services.repository';
import { SettingsRepository } from './settings/settings.repository';
import { SyncRunsRepository } from './sync-runs/sync-runs.repository';

const REPOSITORIES = [
  ApiTokensRepository,
  AuthConfigRepository,
  BalanceSnapshotsRepository,
  ExchangeRatesRepository,
  ExchangeRatesDailyRepository,
  NotificationLogRepository,
  PasskeysRepository,
  PaymentsRepository,
  ProjectsRepository,
  ProvidersRepository,
  ServicesRepository,
  SettingsRepository,
  SyncRunsRepository,
];

// Global, like PrismaModule: repositories are the data-access layer for every feature module,
// so they're registered once instead of being imported module-by-module.
@Global()
@Module({
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoriesModule {}
