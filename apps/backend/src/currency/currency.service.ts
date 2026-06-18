import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExchangeRate } from '@generated/prisma/client';
import Decimal from 'decimal.js';
import { Rate } from '@infra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { dateToIso } from '@common/serialize';
import { CbrRateProvider } from './cbr.rate-provider';

const RATE_BASE = 'RUB'; // CBR works in RUB; all stored rates are RUB-per-code.
const ONE = new Decimal(1);
const REFRESH_TIMEOUT_MS = 15_000;

@Injectable()
export class CurrencyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cbr: CbrRateProvider,
  ) {}

  /** Refresh rates on startup (best-effort, fire-and-forget — never blocks/crashes boot). */
  onApplicationBootstrap(): void {
    void this.refreshRates()
      .then((n) => {
        if (n > 0) this.logger.log(`Rates refreshed on startup: ${n}`);
      })
      .catch((e) =>
        this.logger.error(
          'Failed to refresh rates on startup',
          e instanceof Error ? e.stack : String(e),
        ),
      );
  }

  async getEffectiveSettings(): Promise<{ baseCurrency: string; rateSource: 'cbr' | 'manual' }> {
    const s = await this.prisma.settings.findUnique({ where: { id: 1 } });
    // Settings live in the DB; the literals here are only a fallback until the row is created.
    return {
      baseCurrency: s?.baseCurrency ?? 'RUB',
      rateSource: (s?.rateSource ?? 'cbr') as 'cbr' | 'manual',
    };
  }

  /** Latest RUB-per-code rate for every known currency (+ RUB = 1). */
  async getRubRates(): Promise<Map<string, Decimal>> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: { base: RATE_BASE },
      orderBy: { capturedAt: 'desc' },
    });
    const map = new Map<string, Decimal>([['RUB', ONE]]);
    for (const r of rows) {
      if (!map.has(r.code)) map.set(r.code, new Decimal(r.rate.toString()));
    }
    return map;
  }

  /** Convert `amount` from currency `from` to `toBase` via RUB. Best-effort (never throws). */
  convert(amount: Decimal, from: string, toBase: string, rates: Map<string, Decimal>): Decimal {
    if (from === toBase) return amount;
    const fromRate = rates.get(from);
    const baseRate = rates.get(toBase);
    if (!fromRate || !baseRate) {
      this.logger.warn(`No rate ${from}->${toBase}; amount left unchanged`);
      return amount;
    }
    return amount.mul(fromRate).div(baseRate);
  }

  /** Fetch + cache rates from the active source. Returns the number of stored rates. */
  async refreshRates(): Promise<number> {
    const { rateSource } = await this.getEffectiveSettings();
    if (rateSource !== 'cbr') {
      this.logger.log(`rateSource=${rateSource}: external rate refresh skipped`);
      return 0;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const quotes = await this.cbr.fetchRates(controller.signal);
      await this.prisma.exchangeRate.createMany({
        data: quotes.map((q) => ({
          code: q.code,
          base: RATE_BASE,
          rate: q.perRub.toFixed(8),
          source: 'cbr',
        })),
      });
      this.logger.log(`Rates refreshed: ${quotes.length} (source cbr)`);
      return quotes.length;
    } finally {
      clearTimeout(timer);
    }
  }

  async addManualRate(code: string, rate: string): Promise<Rate> {
    const row = await this.prisma.exchangeRate.create({
      data: { code, base: RATE_BASE, rate, source: 'manual' },
    });
    return this.toDto(row);
  }

  /** Latest rate per currency. */
  async listRates(): Promise<Rate[]> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: { base: RATE_BASE },
      orderBy: { capturedAt: 'desc' },
    });
    const seen = new Set<string>();
    const out: Rate[] = [];
    for (const r of rows) {
      if (seen.has(r.code)) continue;
      seen.add(r.code);
      out.push(this.toDto(r));
    }
    return out;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduledRefresh(): Promise<void> {
    try {
      await this.refreshRates();
    } catch (e) {
      this.logger.error('Scheduled rate refresh failed', e instanceof Error ? e.stack : String(e));
    }
  }

  private toDto(r: ExchangeRate): Rate {
    return {
      code: r.code,
      base: r.base,
      rate: r.rate.toString(),
      source: r.source as Rate['source'],
      capturedAt: dateToIso(r.capturedAt)!,
    };
  }
}
