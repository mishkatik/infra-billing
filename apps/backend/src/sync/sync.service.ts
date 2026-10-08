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
import { ProviderAccountsRepository } from '@repositories/provider-accounts/provider-accounts.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { ServicesRepository } from '@repositories/services/services.repository';
import { SettingsRepository } from '@repositories/settings/settings.repository';
import { SyncRunsRepository } from '@repositories/sync-runs/sync-runs.repository';
import { CryptoService } from '../crypto/crypto.service';
import { FaviconsService } from '../favicons/favicons.service';
import { ConnectorFactory } from '@connectors/connector.factory';
import { PaymentData, ServiceData } from '@connectors/connector.interface';
import { mapSyncRun } from '@common/mappers';

const SYNC_TIMEOUT_MS = 120_000;
const SYNC_INTERVAL_NAME = 'provider-sync';
const DEFAULT_SYNC_INTERVAL_HOURS = 6; // fallback only, until the Settings row exists
const FETCH_ATTEMPTS = 2; // total tries per phase (1 retry)
const FETCH_RETRY_DELAY_MS = 2_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SyncSummary {
  total: number;
  ok: number;
  failed: number;
}

/** Rows a sync writes carry both uuids: the (account, provider) foreign key checks they agree. */
interface AccountOwner {
  accountUuid: string;
  providerUuid: string;
}

/** "Name · label" for logs; the provider's original (unlabelled) account is just "Name". */
const accountName = (providerName: string, label: string | null) =>
  label ? `${providerName} · ${label}` : providerName;

function summarize(results: PromiseSettledResult<SyncRunDto>[]): SyncSummary {
  let ok = 0;
  for (const r of results) if (r.status === 'fulfilled' && r.value.status === 'ok') ok += 1;
  return { total: results.length, ok, failed: results.length - ok };
}

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private intervalMs = DEFAULT_SYNC_INTERVAL_HOURS * 3_600_000;
  // When the next scheduled autosync fires. In-memory: set on boot/reschedule and advanced on each
  // tick, so it resets to now+interval whenever the process restarts (which is when the timer does).
  private nextRunAt: Date | null = null;

  constructor(
    private readonly providers: ProvidersRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly services: ServicesRepository,
    private readonly payments: PaymentsRepository,
    private readonly snapshots: BalanceSnapshotsRepository,
    private readonly syncRuns: SyncRunsRepository,
    private readonly settings: SettingsRepository,
    private readonly crypto: CryptoService,
    private readonly favicons: FaviconsService,
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

  /** Sync every enabled account of a non-manual provider, one by one; failures are isolated. */
  async syncAllProviders(): Promise<void> {
    const accounts = await this.accounts.listSyncable();
    for (const a of accounts) {
      try {
        await this.syncAccount(a.uuid);
      } catch (e) {
        this.logger.error(
          `Sync "${accountName(a.provider.name, a.label)}" (${a.uuid}) failed`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }
  }

  /** Manually sync every enabled account of a non-manual provider in parallel; UI summary. */
  async syncAll(): Promise<SyncSummary> {
    const accounts = await this.accounts.listSyncable();
    return summarize(await Promise.allSettled(accounts.map((a) => this.syncAccount(a.uuid))));
  }

  /** Sync every enabled account of one provider in parallel. */
  async syncProvider(providerUuid: string): Promise<SyncSummary> {
    const provider = await this.providers.findWithAccounts(providerUuid);
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.kind === 'manual') {
      throw new BadRequestException('Manual providers cannot be synced');
    }
    const enabled = provider.accounts.filter((a) => a.isEnabled);
    if (enabled.length === 0) throw new BadRequestException('Provider is disabled');
    return summarize(await Promise.allSettled(enabled.map((a) => this.syncAccount(a.uuid))));
  }

  async syncAccount(accountUuid: string): Promise<SyncRunDto> {
    const account = await this.accounts.findByUuid(accountUuid);
    if (!account) throw new NotFoundException('Account not found');
    const { provider } = account;
    if (provider.kind === 'manual') {
      throw new BadRequestException('Manual providers cannot be synced');
    }
    // Switched off by the owner: no run, no lastSyncError, nothing for the alerts to pick up.
    if (!account.isEnabled) throw new BadRequestException('Account is disabled');

    const providerUuid = provider.uuid;
    const name = accountName(provider.name, account.label);
    const run = await this.syncRuns.createRunning(accountUuid);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    try {
      if (!account.credentialsEnc) throw new Error('Account has no API token');
      const token = this.crypto.decrypt(account.credentialsEnc);
      const connector = this.connectors.create(provider.kind, token);

      // Needs no auth (reads the public login page) and runs before fetchAccount: the icon
      // resolves even when the credentials are wrong. Non-fatal; null keeps the stored link.
      // The icon belongs to the provider, so every account refreshes the same link.
      if (connector.fetchFaviconUrl) {
        try {
          const url = await connector.fetchFaviconUrl(controller.signal);
          if (url && url !== provider.faviconLink) {
            await this.providers.updateFaviconLink(providerUuid, url);
            this.favicons.invalidateProvider(providerUuid);
          }
        } catch (e) {
          this.logger.warn(
            `Favicon fetch for "${name}" (${accountUuid}) skipped: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      const remote = await this.withRetry(`fetchAccount "${name}"`, controller.signal, () =>
        connector.fetchAccount(controller.signal),
      );
      // Some providers (e.g. Hetzner) expose no account balance → skip balance/snapshot.
      if (remote.balance !== null) {
        const balance = remote.balance.toFixed(2);
        await this.accounts.updateBalance(accountUuid, balance, remote.currency);
        await this.snapshots.record(accountUuid, balance, remote.currency);
      }

      const fetched = await this.withRetry(`fetchServices "${name}"`, controller.signal, () =>
        connector.fetchServices(controller.signal),
      );
      const owner = { accountUuid, providerUuid };
      const servicesFound = await this.upsertServices(owner, fetched, remote.currency);

      // Import the payment/expense ledger for connectors that expose one (e.g. BILLmanager).
      // Non-fatal: a ledger failure must not lose the services/balance sync.
      if (connector.fetchPayments) {
        try {
          const payments = await this.withRetry(
            `fetchPayments "${name}"`,
            controller.signal,
            // The narrowing from the `if` guard above does not survive into the closure.
            () => connector.fetchPayments!(controller.signal),
          );
          const imported = await this.upsertPayments(owner, payments);
          if (imported) {
            this.logger.log(`Sync "${name}" (${accountUuid}): imported ${imported} payment(s)`);
          }
        } catch (e) {
          this.logger.warn(
            `Payment import for "${name}" (${accountUuid}) skipped: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      await this.accounts.markSynced(accountUuid);
      const done = await this.syncRuns.markOk(run.id, servicesFound);
      this.logger.log(`Sync "${name}" (${accountUuid}): ok, ${servicesFound} service(s)`);
      return mapSyncRun(done);
    } catch (e) {
      // On a sync-wide abort axios reports just "canceled" — name the real reason for lastSyncError.
      const message = controller.signal.aborted
        ? `Sync timed out after ${SYNC_TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : String(e);
      await this.accounts.recordSyncError(accountUuid, message);
      const failed = await this.syncRuns.markError(run.id, message);
      this.logger.warn(`Sync "${name}" (${accountUuid}): error — ${message}`);
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

  async listSyncRuns(accountUuid: string, limit = 50): Promise<SyncRunDto[]> {
    const rows = await this.syncRuns.listForAccount(accountUuid, limit);
    return rows.map(mapSyncRun);
  }

  /** Upsert fetched services by (account, externalId); preserve owner price edits. */
  private async upsertServices(
    owner: AccountOwner,
    fetched: ServiceData[],
    accountCurrency: string,
  ): Promise<number> {
    const seen = new Set<string>();
    for (const sd of fetched) {
      seen.add(sd.externalId);
      // A connector can emit an Invalid Date from an unexpected API string — don't let one
      // bad date fail the whole account sync.
      const nextBilling =
        sd.nextBilling && !Number.isNaN(sd.nextBilling.getTime()) ? sd.nextBilling : null;
      const existing = await this.services.findByExternalId(owner.accountUuid, sd.externalId);
      // Keep the provider's proposed name/type/cost/vendor in meta even when overridden, so the
      // UI can drop the pencil (and update can clear the flag) when the owner reverts.
      const incomingMeta = { ...(sd.meta ?? {}) } as Record<string, unknown>;
      const incomingVendor =
        typeof incomingMeta.vendor === 'string' && incomingMeta.vendor.trim()
          ? incomingMeta.vendor.trim()
          : null;
      const prevMeta = (existing?.meta ?? {}) as Record<string, unknown>;
      const prevVendor =
        typeof prevMeta.vendor === 'string' && prevMeta.vendor.trim()
          ? prevMeta.vendor.trim()
          : null;
      const prevSyncedVendor =
        typeof prevMeta.syncedVendor === 'string' && prevMeta.syncedVendor.trim()
          ? prevMeta.syncedVendor.trim()
          : null;
      const vendorOverridden =
        Boolean(prevVendor) &&
        ((prevSyncedVendor != null && prevVendor !== prevSyncedVendor) ||
          (prevSyncedVendor == null && incomingVendor != null && prevVendor !== incomingVendor));

      const meta = {
        ...incomingMeta,
        syncedName: sd.name,
        syncedType: sd.type,
        syncedCost: sd.cost != null ? sd.cost.toFixed(2) : null,
        // A synced price is a cost in a period and a currency: the form restores all three, or a
        // daily figure would come back as a monthly price.
        ...(sd.period ? { syncedPeriod: sd.period } : {}),
        syncedCurrency: sd.currency ?? accountCurrency,
        ...(sd.countryCode ? { syncedCountry: sd.countryCode } : {}),
        ...(incomingVendor ? { syncedVendor: incomingVendor } : {}),
        ...(vendorOverridden && prevVendor ? { vendor: prevVendor } : {}),
      } as Prisma.InputJsonValue;

      if (!existing) {
        await this.services.create({
          ...owner,
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
          meta,
        });
      } else {
        const data: Prisma.ServiceUncheckedUpdateInput = {
          isActive: true,
          meta,
        };
        // Don't overwrite a manually-edited name.
        if (!existing.nameOverridden) data.name = sd.name;
        // Don't overwrite a manually-edited type.
        if (!existing.typeOverridden) data.type = sd.type;
        if (sd.countryCode) data.countryCode = sd.countryCode;
        if (sd.nextBilling !== undefined) data.nextBillingAt = nextBilling;
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
    await this.services.deactivateMissing(owner.accountUuid, Array.from(seen));

    return fetched.length;
  }

  /**
   * Upsert imported payments by (accountUuid, externalId): idempotent across re-syncs, and
   * never touches manually-entered payments (those have externalId = null). Charges are linked
   * to a service of the same account when their serviceExternalId matches its externalId.
   */
  private async upsertPayments(owner: AccountOwner, payments: PaymentData[]): Promise<number> {
    if (payments.length === 0) return 0;
    const services = await this.services.listExternalIds(owner.accountUuid);
    const serviceByExternalId = new Map<string, string>();
    for (const s of services) if (s.externalId) serviceByExternalId.set(s.externalId, s.uuid);

    for (const p of payments) {
      const serviceUuid = p.serviceExternalId
        ? (serviceByExternalId.get(p.serviceExternalId) ?? null)
        : null;
      await this.payments.upsertExternal(owner.accountUuid, owner.providerUuid, p.externalId, {
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
