import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SyncRunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createRunning(accountUuid: string) {
    return this.prisma.syncRun.create({ data: { accountUuid, status: 'running' } });
  }

  markOk(id: bigint, servicesFound: number) {
    return this.prisma.syncRun.update({
      where: { id },
      data: { status: 'ok', servicesFound, finishedAt: new Date() },
    });
  }

  markError(id: bigint, error: string) {
    return this.prisma.syncRun.update({
      where: { id },
      data: { status: 'error', error, finishedAt: new Date() },
    });
  }

  listForAccount(accountUuid: string, limit: number) {
    return this.prisma.syncRun.findMany({
      where: { accountUuid },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Failed runs finished since `since`, newest first, with the account label and the provider
   * name / login link (plus its account count, so a message knows whether to name the account).
   */
  listErrorsSince(since: Date) {
    return this.prisma.syncRun.findMany({
      where: { status: 'error', finishedAt: { gte: since } },
      orderBy: { finishedAt: 'desc' },
      include: {
        account: {
          select: {
            label: true,
            provider: {
              select: { name: true, loginUrl: true, _count: { select: { accounts: true } } },
            },
          },
        },
      },
    });
  }
}
