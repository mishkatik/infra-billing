import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Accounts oldest first, each with its own service / payment counts (the provider totals are sums).
const WITH_ACCOUNTS = {
  accounts: {
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { services: true, payments: true } } },
  },
} as const;

@Injectable()
export class ProvidersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Identity rows only (name, kind, icon…); balance and sync state live on the accounts. */
  listAll() {
    return this.prisma.provider.findMany({ orderBy: { createdAt: 'asc' } });
  }

  listWithAccounts() {
    return this.prisma.provider.findMany({ orderBy: { createdAt: 'asc' }, include: WITH_ACCOUNTS });
  }

  findByUuid(uuid: string) {
    return this.prisma.provider.findUnique({ where: { uuid } });
  }

  findWithAccounts(uuid: string) {
    return this.prisma.provider.findUnique({ where: { uuid }, include: WITH_ACCOUNTS });
  }

  findWithServices(uuid: string) {
    return this.prisma.provider.findUnique({
      where: { uuid },
      include: {
        ...WITH_ACCOUNTS,
        accounts: {
          ...WITH_ACCOUNTS.accounts,
          include: {
            ...WITH_ACCOUNTS.accounts.include,
            services: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
  }

  async exists(uuid: string): Promise<boolean> {
    const found = await this.prisma.provider.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    return found !== null;
  }

  /** Creates the provider; pass its first account through `data.accounts.create`. */
  create(data: Prisma.ProviderCreateInput) {
    return this.prisma.provider.create({ data, include: WITH_ACCOUNTS });
  }

  update(uuid: string, data: Prisma.ProviderUpdateInput) {
    return this.prisma.provider.update({ where: { uuid }, data, include: WITH_ACCOUNTS });
  }

  async delete(uuid: string): Promise<void> {
    await this.prisma.provider.delete({ where: { uuid } });
  }

  async updateFaviconLink(uuid: string, url: string): Promise<void> {
    await this.prisma.provider.update({ where: { uuid }, data: { faviconLink: url } });
  }

  /**
   * Folds `sourceUuid` into `targetUuid` in one transaction: the source's accounts move over under
   * the labels in `relabel` (so they stay recognisable and unique next to the target's own), the
   * target's empty identity fields are filled from `fill`, and the source is deleted. Services and
   * payments follow their accounts through the (account_uuid, provider_uuid) foreign key's
   * ON UPDATE CASCADE.
   */
  merge(
    sourceUuid: string,
    targetUuid: string,
    relabel: { uuid: string; label: string }[],
    fill: Prisma.ProviderUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      for (const { uuid, label } of relabel) {
        await tx.providerAccount.update({ where: { uuid }, data: { label } });
      }
      await tx.providerAccount.updateMany({
        where: { providerUuid: sourceUuid },
        data: { providerUuid: targetUuid },
      });
      await tx.provider.update({ where: { uuid: targetUuid }, data: fill });
      await tx.provider.delete({ where: { uuid: sourceUuid } });
      return tx.provider.findUniqueOrThrow({ where: { uuid: targetUuid }, include: WITH_ACCOUNTS });
    });
  }
}
