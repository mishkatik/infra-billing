import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Prisma } from '@generated/prisma/client';
import { DEFAULT_PROJECT_UUID, SyncRun as SyncRunDto } from '@infra/shared';
import { BalanceSnapshotsRepository } from '@repositories/balance-snapshots/balance-snapshots.repository';
import { PaymentsRepository } from '@repositories/payments/payments.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { ServicesRepository } from '@repositories/services/services.repository';
import { SettingsRepository } from '@repositories/settings/settings.repository';
import { SyncRunsRepository } from '@repositories/sync-runs/sync-runs.repository';
import { CryptoService } from '../crypto/crypto.service';
import { ConnectorFactory } from '@connectors/connector.factory';
import { PaymentData, ServiceData } from '@connectors/connector.interface';
import { mapSyncRun } from '@common/mappers';

const SYNC_TIMEOUT_MS = 120_000;
const SYNC_INTERVAL_NAME = 'provider-sync';
const DEFAULT_SYNC_INTERVAL_HOURS = 6; // fallback only, until the Settings row exists
const FETCH_ATTEMPTS = 2; // total tries per phase (1 retry)
const FETCH_RETRY_DELAY_MS = 2_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private intervalMs = DEFAULT_SYNC_INTERVAL_HOURS * 3_600_000;
  // When the next scheduled autosync fires. In-memory: set on boot/reschedule and advanced on each
  // tick, so it resets to now+interval whenever the process restarts (which is when the timer does).
  private nextRunAt: Date | null = null;

  constructor(
    private readonly providers: ProvidersRepository,
    private readonly services: ServicesRepository,
    private readonly payments: PaymentsRepository,
    private readonly snapshots: BalanceSnapshotsRepository,
    private readonly syncRuns: SyncRunsRepository,
    private readonly settings: SettingsRepository,
    private readonly crypto: CryptoService,
    private readonly connectors: ConnectorFactory,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    // Sync cadence is owned by the DB Settings row (editable in the panel), not env.
    const s = await this.settings.find();
    this.applyInterval(s?.syncIntervalHours ?? DEFAULT_SYNC_INTERVAL_HOURS);
  }

  /** Re-schedule the autosync when the interval changes in Settings (takes effect without restart). */
  reschedule(hours: number): void {
    this.applyInterval(hours);
  }

  /** When the next scheduled autosync will run (null until the scheduler is armed). */
  getNextSyncAt(): Date | null {
    return this.nextRunAt;
  }

  private applyInterval(hours: number): void {
    // Clear any prior timer, then (re)register at the new cadence.
    try {
      this.scheduler.deleteInterval(SYNC_INTERVAL_NAME);
    } catch {
      // not scheduled yet (first run), nothing to clear
    }
    this.intervalMs = hours * 3_600_000;
    const interval = setInterval(() => {
      void this.syncAllProviders();
      // The timer just fired. The next tick is one interval out.
      this.nextRunAt = new Date(Date.now() + this.intervalMs);
    }, this.intervalMs);
    this.scheduler.addInterval(SYNC_INTERVAL_NAME, interval);
    this.nextRunAt = new Date(Date.now() + this.intervalMs);
    this.logger.log(`Provider autosync every ${hours}h`);
  }

  /** Sync every non-manual provider; failures are isolated. */
  async syncAllProviders(): Promise<void> {
    const providers = await this.providers.listSyncable();
    for (const p of providers) {
      try {
        await this.syncProvider(p.uuid);
      } catch (e) {
        this.logger.error(
          `Sync "${p.name}" (${p.uuid}) failed`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }
  }

  /** Manually sync every non-manual provider in parallel; returns a summary for the UI. */
  async syncAll(): Promise<{ total: number; ok: number; failed: number }> {
    const providers = await this.providers.listSyncable();
    const results = await Promise.allSettled(providers.map((p) => this.syncProvider(p.uuid)));
    let ok = 0;
    let failed = 0;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.status === 'ok') ok += 1;
      else failed += 1;
    }
    return { total: providers.length, ok, failed };
  }

  async syncProvider(uuid: string): Promise<SyncRunDto> {
    const provider = await this.providers.findByUuid(uuid);
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.kind === 'manual') {
      throw new BadRequestException('Manual providers cannot be synced');
    }

    const run = await this.syncRuns.createRunning(uuid);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    try {
      if (!provider.credentialsEnc) throw new Error('Provider has no API token');
      const token = this.crypto.decrypt(provider.credentialsEnc);
      const connector = this.connectors.create(provider.kind, token);

      const account = await this.withRetry(
        `fetchAccount "${provider.name}"`,
        controller.signal,
        () => connector.fetchAccount(controller.signal),
      );
      // Some providers (e.g. Hetzner) expose no account balance → skip balance/snapshot.
      if (account.balance !== null) {
        const balance = account.balance.toFixed(2);
        await this.providers.updateBalance(uuid, balance, account.currency);
        await this.snapshots.record(uuid, balance, account.currency);
      }

      const fetched = await this.withRetry(
        `fetchServices "${provider.name}"`,
        controller.signal,
        () => connector.fetchServices(controller.signal),
      );
      const servicesFound = await this.upsertServices(uuid, fetched, account.currency);

      // Import the payment/expense ledger for connectors that expose one (e.g. BILLmanager).
      // Non-fatal: a ledger failure must not lose the services/balance sync.
      if (connector.fetchPayments) {
        try {
          const payments = await this.withRetry(
            `fetchPayments "${provider.name}"`,
            controller.signal,
            // The narrowing from the `if` guard above does not survive into the closure.
            () => connector.fetchPayments!(controller.signal),
          );
          const imported = await this.upsertPayments(uuid, payments);
          if (imported) {
            this.logger.log(`Sync "${provider.name}" (${uuid}): imported ${imported} payment(s)`);
          }
        } catch (e) {
          this.logger.warn(
            `Payment import for "${provider.name}" (${uuid}) skipped: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      await this.providers.markSynced(uuid);
      const done = await this.syncRuns.markOk(run.id, servicesFound);
      this.logger.log(`Sync "${provider.name}" (${uuid}): ok, ${servicesFound} service(s)`);
      return mapSyncRun(done);
    } catch (e) {
      // On a sync-wide abort axios reports just "canceled" — name the real reason for lastSyncError.
      const message = controller.signal.aborted
        ? `Sync timed out after ${SYNC_TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : String(e);
      await this.providers.recordSyncError(uuid, message);
      const failed = await this.syncRuns.markError(run.id, message);
      this.logger.warn(`Sync "${provider.name}" (${uuid}): error — ${message}`);
      return mapSyncRun(failed);
    } finally {
      clearTimeout(timer);
    }
  }

  // Provider APIs are read-only for us, so repeating a failed fetch is always safe. One retry
  // absorbs transient network hiccups; once the sync budget is spent a retry would only be
  // aborted again, so it is skipped.
  private async withRetry<T>(label: string, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn();
      } catch (e) {
        if (attempt >= FETCH_ATTEMPTS || signal.aborted) throw e;
        this.logger.warn(
          `${label} failed (attempt ${attempt}/${FETCH_ATTEMPTS}), retrying in ${FETCH_RETRY_DELAY_MS / 1000}s: ${e instanceof Error ? e.message : String(e)}`,
        );
        await delay(FETCH_RETRY_DELAY_MS);
      }
    }
  }

  async listSyncRuns(uuid: string, limit = 50): Promise<SyncRunDto[]> {
    const rows = await this.syncRuns.listForProvider(uuid, limit);
    return rows.map(mapSyncRun);
  }

  /** Upsert fetched services by (provider, externalId); preserve owner price edits. */
  private async upsertServices(
    providerUuid: string,
    fetched: ServiceData[],
    accountCurrency: string,
  ): Promise<number> {
    const seen = new Set<string>();
    for (const sd of fetched) {
      seen.add(sd.externalId);
      // A connector can emit an Invalid Date from an unexpected API string — don't let one
      // bad date fail the whole provider sync.
      const nextBilling =
        sd.nextBilling && !Number.isNaN(sd.nextBilling.getTime()) ? sd.nextBilling : null;
      const existing = await this.services.findByExternalId(providerUuid, sd.externalId);
      if (!existing) {
        await this.services.create({
          providerUuid,
          // Providers are shared, so a sync can't know the project. Land new services in the
          // default project; the owner reassigns them on the Services page.
          projectUuid: DEFAULT_PROJECT_UUID,
          externalId: sd.externalId,
          name: sd.name,
          type: sd.type,
          countryCode: sd.countryCode ?? 'XX',
          cost: sd.cost ? sd.cost.toFixed(2) : '0.00',
          currency: sd.currency ?? accountCurrency,
          period: sd.period ?? 'monthly',
          nextBillingAt: nextBilling,
          isActive: true,
          isManaged: true,
          meta: (sd.meta ?? {}) as Prisma.InputJsonValue,
        });
      } else {
        const data: Prisma.ServiceUpdateInput = {
          type: sd.type,
          isActive: true,
          meta: (sd.meta ?? {}) as Prisma.InputJsonValue,
        };
        // Don't overwrite a manually-edited name.
        if (!existing.nameOverridden) data.name = sd.name;
        if (sd.countryCode) data.countryCode = sd.countryCode;
        if (nextBilling) data.nextBillingAt = nextBilling;
        // Don't overwrite a manually-edited price.
        if (!existing.costOverridden) {
          if (sd.cost) data.cost = sd.cost.toFixed(2);
          if (sd.period) data.period = sd.period;
          // Refresh currency from the connector (or the account currency) on every sync.
          data.currency = sd.currency ?? accountCurrency;
        }
        await this.services.update(existing.uuid, data);
      }
    }

    // Managed services no longer returned by the API → mark inactive (don't delete).
    await this.services.deactivateMissing(providerUuid, Array.from(seen));

    return fetched.length;
  }

  /**
   * Upsert imported payments by (providerUuid, externalId): idempotent across re-syncs, and
   * never touches manually-entered payments (those have externalId = null). Charges are linked
   * to a service when their serviceExternalId matches a managed service's externalId.
   */
  private async upsertPayments(providerUuid: string, payments: PaymentData[]): Promise<number> {
    if (payments.length === 0) return 0;
    const services = await this.services.listExternalIds(providerUuid);
    const serviceByExternalId = new Map<string, string>();
    for (const s of services) if (s.externalId) serviceByExternalId.set(s.externalId, s.uuid);

    for (const p of payments) {
      const serviceUuid = p.serviceExternalId
        ? (serviceByExternalId.get(p.serviceExternalId) ?? null)
        : null;
      await this.payments.upsertExternal(providerUuid, p.externalId, {
        amount: p.amount.toFixed(2),
        currency: p.currency,
        type: p.type,
        description: p.description ?? null,
        paymentDate: p.date,
        serviceUuid,
      });
    }
    return payments.length;
  }
}
