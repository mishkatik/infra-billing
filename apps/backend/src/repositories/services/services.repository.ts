import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ServiceFilters {
  providerUuid?: string;
  projectUuid?: string;
  /** Hard scope for member accounts; empty array yields no rows. */
  projectUuids?: string[];
  type?: string;
  isActive?: boolean;
}

@Injectable()
export class ServicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listFiltered(filters: ServiceFilters) {
    const where: Prisma.ServiceWhereInput = {};
    if (filters.providerUuid) where.providerUuid = filters.providerUuid;
    if (filters.projectUuid) where.projectUuid = filters.projectUuid;
    if (filters.projectUuids) where.projectUuid = { in: [...filters.projectUuids] };
    if (filters.type) where.type = filters.type;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    return this.prisma.service.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { payments: true } } },
    });
  }

  listActive() {
    return this.prisma.service.findMany({ where: { isActive: true } });
  }

  listActiveByProject(projectUuid: string) {
    return this.prisma.service.findMany({ where: { isActive: true, projectUuid } });
  }

  /** Active services with a known next billing date (forecast input). */
  listActiveBilled() {
    return this.prisma.service.findMany({
      where: { isActive: true, nextBillingAt: { not: null } },
    });
  }

  /** (uuid, externalId) pairs of a provider's services — for linking imported payments. */
  listExternalIds(providerUuid: string) {
    return this.prisma.service.findMany({
      where: { providerUuid },
      select: { uuid: true, externalId: true },
    });
  }

  findByUuid(uuid: string) {
    return this.prisma.service.findUnique({ where: { uuid } });
  }

  findByExternalId(providerUuid: string, externalId: string) {
    return this.prisma.service.findFirst({ where: { providerUuid, externalId } });
  }

  async exists(uuid: string): Promise<boolean> {
    const found = await this.prisma.service.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    return found !== null;
  }

  create(data: Prisma.ServiceUncheckedCreateInput) {
    return this.prisma.service.create({ data });
  }

  update(uuid: string, data: Prisma.ServiceUpdateInput) {
    return this.prisma.service.update({ where: { uuid }, data });
  }

  /** Move a service to another provider, relinking its payments in the same transaction. */
  moveToProvider(uuid: string, providerUuid: string, data: Prisma.ServiceUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { serviceUuid: uuid },
        data: { providerUuid },
      });
      return tx.service.update({
        where: { uuid },
        data: { ...data, provider: { connect: { uuid: providerUuid } } },
      });
    });
  }

  async delete(uuid: string): Promise<void> {
    await this.prisma.service.delete({ where: { uuid } });
  }

  /** Managed services no longer returned by the provider API → mark inactive (never delete). */
  async deactivateMissing(providerUuid: string, seenExternalIds: string[]): Promise<void> {
    await this.prisma.service.updateMany({
      where: { providerUuid, isManaged: true, externalId: { notIn: seenExternalIds } },
      data: { isActive: false },
    });
  }

  /** Move EVERY service (from any project) into the given project. Returns the count moved. */
  async moveAllToProject(projectUuid: string): Promise<number> {
    const { count } = await this.prisma.service.updateMany({
      where: { projectUuid: { not: projectUuid } },
      data: { projectUuid },
    });
    return count;
  }

  /** Move one project's services into another. Returns the count moved. */
  async moveProjectServices(fromProjectUuid: string, toProjectUuid: string): Promise<number> {
    const { count } = await this.prisma.service.updateMany({
      where: { projectUuid: fromProjectUuid },
      data: { projectUuid: toProjectUuid },
    });
    return count;
  }
}
