import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ExchangeRatesDailyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Whole archive for a base, oldest first — callers build a per-code as-of index from it. */
  listByBaseAsc(base: string) {
    return this.prisma.exchangeRateDaily.findMany({
      where: { base },
      orderBy: { rateDate: 'asc' },
      select: { code: true, rateDate: true, rate: true, source: true },
    });
  }

  /** Idempotent — the (code, base, rate_date) unique index makes a re-run a no-op. */
  async createMany(rows: Prisma.ExchangeRateDailyCreateManyInput[]): Promise<number> {
    if (rows.length === 0) return 0;
    const { count } = await this.prisma.exchangeRateDaily.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * Stored day range per code. `before` excludes the tail — the daily refresh stamps today on
   * every boot, which would make a gap left by downtime look like full coverage.
   */
  async coverage(base: string, before: Date): Promise<Map<string, { first: Date; last: Date }>> {
    const rows = await this.prisma.exchangeRateDaily.groupBy({
      by: ['code'],
      where: { base, rateDate: { lt: before } },
      _min: { rateDate: true },
      _max: { rateDate: true },
    });
    return new Map(
      rows
        .filter((r) => r._min.rateDate && r._max.rateDate)
        .map((r) => [r.code, { first: r._min.rateDate!, last: r._max.rateDate! }]),
    );
  }
}
