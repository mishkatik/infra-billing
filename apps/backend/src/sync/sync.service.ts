import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Prisma } from '@generated/prisma/client';
import { SyncRun as SyncRunDto } from '@infra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ConnectorFactory } from '@connectors/connector.factory';
import { PaymentData, ServiceData } from '@connectors/connector.interface';
import { mapSyncRun } from '@common/mappers';

const SYNC_TIMEOUT_MS = 30_000;
const SYNC_INTERVAL_NAME = 'provider-sync';
const DEFAULT_SYNC_INTERVAL_HOURS = 6; // fallback only, until the Settings row exists

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly connectors: ConnectorFactory,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    // Sync cadence is owned by the DB Settings row (editable in the panel), not env.
    const s = await this.prisma.settings.findUnique({ where: { id: 1 } });
    this.applyInterval(s?.syncIntervalHours ?? DEFAULT_SYNC_INTERVAL_HOURS);
  }

  /** Re-schedule the autosync when the interval changes in Settings (takes effect without restart). */
  reschedule(hours: number): void {
    this.applyInterval(hours);
  }

  private applyInterval(hours: number): void {
    // Clear any prior timer, then (re)register at the new cadence.
    try {
      this.scheduler.deleteInterval(SYNC_INTERVAL_NAME);
    } catch {
      // not scheduled yet (first run) — nothing to clear
    }
    const interval = setInterval(() => void this.syncAllProviders(), hours * 3_600_000);
    this.scheduler.addInterval(SYNC_INTERVAL_NAME, interval);
    this.logger.log(`Provider autosync every ${hours}h`);
  }

  /** Sync every non-manual provider; failures are isolated. */
  async syncAllProviders(): Promise<void> {
    const providers = await this.prisma.provider.findMany({
      where: { kind: { not: 'manual' } },
      select: { uuid: true, name: true },
    });
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
    const providers = await this.prisma.provider.findMany({
      where: { kind: { not: 'manual' } },
      select: { uuid: true },
    });
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
    const provider = await this.prisma.provider.findUnique({ where: { uuid } });
    if (!provider) throw new NotFoundException('Provider not found');
    if (provider.kind === 'manual') {
      throw new BadRequestException('Manual providers cannot be synced');
    }

    const run = await this.prisma.syncRun.create({
      data: { providerUuid: uuid, status: 'running' },
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    try {
      if (!provider.credentialsEnc) throw new Error('Provider has no API token');
      const token = this.crypto.decrypt(provider.credentialsEnc);
      const connector = this.connectors.create(provider.kind, token);

      const account = await connector.fetchAccount(controller.signal);
      // Some providers (e.g. Hetzner) expose no account balance → skip balance/snapshot.
      if (account.balance !== null) {
        const balance = account.balance.toFixed(2);
        await this.prisma.provider.update({
          where: { uuid },
          data: { balance, balanceCurrency: account.currency, balanceSyncedAt: new Date() },
        });
        await this.prisma.balanceSnapshot.create({
          data: { providerUuid: uuid, balance, currency: account.currency },
        });
      }

      const fetched = await connector.fetchServices(controller.signal);
      const servicesFound = await this.upsertServices(uuid, fetched, account.currency);

      // Import the payment/expense ledger for connectors that expose one (e.g. BILLmanager).
      // Non-fatal: a ledger failure must not lose the services/balance sync.
      if (connector.fetchPayments) {
        try {
          const payments = await connector.fetchPayments(controller.signal);
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

      await this.prisma.provider.update({
        where: { uuid },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
      const done = await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'ok', servicesFound, finishedAt: new Date() },
      });
      this.logger.log(`Sync "${provider.name}" (${uuid}): ok, ${servicesFound} service(s)`);
      return mapSyncRun(done);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.provider
        .update({ where: { uuid }, data: { lastSyncError: message } })
        .catch(() => undefined);
      const failed = await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'error', error: message, finishedAt: new Date() },
      });
      this.logger.warn(`Sync "${provider.name}" (${uuid}): error — ${message}`);
      return mapSyncRun(failed);
    } finally {
      clearTimeout(timer);
    }
  }

  async listSyncRuns(uuid: string, limit = 50): Promise<SyncRunDto[]> {
    const rows = await this.prisma.syncRun.findMany({
      where: { providerUuid: uuid },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
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
      const existing = await this.prisma.service.findFirst({
        where: { providerUuid, externalId: sd.externalId },
      });
      if (!existing) {
        await this.prisma.service.create({
          data: {
            providerUuid,
            externalId: sd.externalId,
            name: sd.name,
            type: sd.type,
            countryCode: sd.countryCode ?? 'XX',
            cost: sd.cost ? sd.cost.toFixed(2) : '0.00',
            currency: sd.currency ?? accountCurrency,
            period: sd.period ?? 'monthly',
            nextBillingAt: sd.nextBilling ?? null,
            isActive: true,
            isManaged: true,
            meta: (sd.meta ?? {}) as Prisma.InputJsonValue,
          },
        });
      } else {
        const data: Prisma.ServiceUpdateInput = {
          name: sd.name,
          type: sd.type,
          isActive: true,
          meta: (sd.meta ?? {}) as Prisma.InputJsonValue,
        };
        if (sd.countryCode) data.countryCode = sd.countryCode;
        if (sd.nextBilling) data.nextBillingAt = sd.nextBilling;
        // Don't overwrite a manually-edited price.
        if (!existing.costOverridden) {
          if (sd.cost) data.cost = sd.cost.toFixed(2);
          if (sd.period) data.period = sd.period;
          // Refresh currency from the connector (or the account currency) on every sync.
          data.currency = sd.currency ?? accountCurrency;
        }
        await this.prisma.service.update({ where: { uuid: existing.uuid }, data });
      }
    }

    // Managed services no longer returned by the API → mark inactive (don't delete).
    await this.prisma.service.updateMany({
      where: { providerUuid, isManaged: true, externalId: { notIn: Array.from(seen) } },
      data: { isActive: false },
    });

    return fetched.length;
  }

  /**
   * Upsert imported payments by (providerUuid, externalId) — idempotent across re-syncs, and
   * never touches manually-entered payments (those have externalId = null). Charges are linked
   * to a service when their serviceExternalId matches a managed service's externalId.
   */
  private async upsertPayments(providerUuid: string, payments: PaymentData[]): Promise<number> {
    if (payments.length === 0) return 0;
    const services = await this.prisma.service.findMany({
      where: { providerUuid },
      select: { uuid: true, externalId: true },
    });
    const serviceByExternalId = new Map<string, string>();
    for (const s of services) if (s.externalId) serviceByExternalId.set(s.externalId, s.uuid);

    for (const p of payments) {
      const serviceUuid = p.serviceExternalId
        ? (serviceByExternalId.get(p.serviceExternalId) ?? null)
        : null;
      const data = {
        amount: p.amount.toFixed(2),
        currency: p.currency,
        type: p.type,
        description: p.description ?? null,
        paymentDate: p.date,
        serviceUuid,
      };
      await this.prisma.payment.upsert({
        where: { providerUuid_externalId: { providerUuid, externalId: p.externalId } },
        create: { providerUuid, externalId: p.externalId, ...data },
        update: data,
      });
    }
    return payments.length;
  }
}
