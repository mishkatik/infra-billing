import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const COUNT_INCLUDE = { _count: { select: { services: true, payments: true } } } as const;

/** Accounts at a provider: credentials, balance and sync state (one hoster can hold several). */
@Injectable()
export class ProviderAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUuid(uuid: string) {
    return this.prisma.providerAccount.findUnique({
      where: { uuid },
      include: { provider: true, ...COUNT_INCLUDE },
    });
  }

  listByProvider(providerUuid: string) {
    return this.prisma.providerAccount.findMany({
      where: { providerUuid },
      orderBy: { createdAt: 'asc' },
      include: COUNT_INCLUDE,
    });
  }

  /** Every account with its provider (analytics keys balance, coverage and runway by account). */
  listAll() {
    return this.prisma.providerAccount.findMany({
      orderBy: { createdAt: 'asc' },
      include: { provider: true },
    });
  }

  /** Enabled accounts of API providers, i.e. the ones autosync and sync-all pick up. */
  listSyncable() {
    return this.prisma.providerAccount.findMany({
      where: { isEnabled: true, provider: { kind: { not: 'manual' } } },
      orderBy: { createdAt: 'asc' },
      select: {
        uuid: true,
        label: true,
        providerUuid: true,
        provider: { select: { name: true, kind: true } },
      },
    });
  }

  findCredentials(uuid: string) {
    return this.prisma.providerAccount.findUnique({
      where: { uuid },
      select: { credentialsEnc: true, provider: { select: { kind: true } } },
    });
  }

  create(data: Prisma.ProviderAccountUncheckedCreateInput) {
    return this.prisma.providerAccount.create({ data, include: COUNT_INCLUDE });
  }

  update(uuid: string, data: Prisma.ProviderAccountUpdateInput) {
    return this.prisma.providerAccount.update({ where: { uuid }, data, include: COUNT_INCLUDE });
  }

  /**
   * Deletes the account unless it is the provider's last one; returns false in that case. The
   * provider row is locked first so two concurrent deletes can't both see "two accounts left".
   */
  deleteUnlessLast(uuid: string, providerUuid: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM providers WHERE uuid = ${providerUuid} FOR UPDATE`;
      if ((await tx.providerAccount.count({ where: { providerUuid } })) <= 1) return false;
      await tx.providerAccount.delete({ where: { uuid } });
      return true;
    });
  }

  async updateBalance(uuid: string, balance: string, currency: string): Promise<void> {
    await this.prisma.providerAccount.update({
      where: { uuid },
      data: { balance, balanceCurrency: currency, balanceSyncedAt: new Date() },
    });
  }

  async markSynced(uuid: string): Promise<void> {
    await this.prisma.providerAccount.update({
      where: { uuid },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });
  }

  /** Best-effort: recording the failure must not mask the original sync error. */
  async recordSyncError(uuid: string, message: string): Promise<void> {
    await this.prisma.providerAccount
      .update({ where: { uuid }, data: { lastSyncError: message } })
      .catch(() => undefined);
  }
}
