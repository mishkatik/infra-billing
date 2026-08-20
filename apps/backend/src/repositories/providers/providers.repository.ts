import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const COUNT_INCLUDE = { _count: { select: { services: true, payments: true } } } as const;

@Injectable()
export class ProvidersRepository {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.provider.findMany({ orderBy: { createdAt: 'asc' } });
  }

  listWithCounts() {
    return this.prisma.provider.findMany({ orderBy: { createdAt: 'asc' }, include: COUNT_INCLUDE });
  }

  /** Non-manual providers, i.e. the ones eligible for API sync. */
  listSyncable() {
    return this.prisma.provider.findMany({
      where: { kind: { not: 'manual' } },
      select: { uuid: true, name: true },
    });
  }

  findByUuid(uuid: string) {
    return this.prisma.provider.findUnique({ where: { uuid } });
  }

  findWithServices(uuid: string) {
    return this.prisma.provider.findUnique({
      where: { uuid },
      include: { ...COUNT_INCLUDE, services: { orderBy: { createdAt: 'asc' } } },
    });
  }

  findCredentials(uuid: string) {
    return this.prisma.provider.findUnique({
      where: { uuid },
      select: { kind: true, credentialsEnc: true },
    });
  }

  async exists(uuid: string): Promise<boolean> {
    const found = await this.prisma.provider.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    return found !== null;
  }

  create(data: Prisma.ProviderCreateInput) {
    return this.prisma.provider.create({ data, include: COUNT_INCLUDE });
  }

  update(uuid: string, data: Prisma.ProviderUpdateInput) {
    return this.prisma.provider.update({ where: { uuid }, data, include: COUNT_INCLUDE });
  }

  async delete(uuid: string): Promise<void> {
    await this.prisma.provider.delete({ where: { uuid } });
  }

  async updateBalance(uuid: string, balance: string, currency: string): Promise<void> {
    await this.prisma.provider.update({
      where: { uuid },
      data: { balance, balanceCurrency: currency, balanceSyncedAt: new Date() },
    });
  }

  async updateFaviconLink(uuid: string, url: string): Promise<void> {
    await this.prisma.provider.update({ where: { uuid }, data: { faviconLink: url } });
  }

  async markSynced(uuid: string): Promise<void> {
    await this.prisma.provider.update({
      where: { uuid },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });
  }

  /** Best-effort: recording the failure must not mask the original sync error. */
  async recordSyncError(uuid: string, message: string): Promise<void> {
    await this.prisma.provider
      .update({ where: { uuid }, data: { lastSyncError: message } })
      .catch(() => undefined);
  }
}
