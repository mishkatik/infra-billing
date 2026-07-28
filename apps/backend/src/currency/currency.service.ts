import { dateToIso } from '@common/serialize';
import { ExchangeRate } from '@generated/prisma/client';
import { CBR_CURRENCIES, Rate, RateBackfill } from '@infra/shared';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Decimal from 'decimal.js';
import { ExchangeRatesRepository } from '@repositories/exchange-rates/exchange-rates.repository';
import { ExchangeRatesDailyRepository } from '@repositories/exchange-rates-daily/exchange-rates-daily.repository';
import { SettingsRepository } from '@repositories/settings/settings.repository';
import { CbrRateProvider } from './cbr.rate-provider';
import { CbrHistoryProvider } from './cbr-history.provider';
import { CmcHistoryProvider } from './cmc-history.provider';
import { RapiraRateProvider } from './rapira.rate-provider';
import { HistoricalRates, utcDay } from './historical-rates';

const RATE_BASE = 'RUB'; // CBR works in RUB; all stored rates are RUB-per-code.
const ONE = new Decimal(1);
const REFRESH_TIMEOUT_MS = 15_000;
const BACKFILL_TIMEOUT_MS = 120_000;
const BACKFILL_FROM = '2024-01-01'; // margin ahead of the oldest payment
const USDT = 'USDT';
// Container egress is often not ready in the first seconds after boot, so retry the startup
// refresh a few times before giving up.
const STARTUP_REFRESH_ATTEMPTS = 3;
const STARTUP_REFRESH_DELAY_MS = 5_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class CurrencyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    private readonly settings: SettingsRepository,
    private readonly rates: ExchangeRatesRepository,
    private readonly daily: ExchangeRatesDailyRepository,
    private readonly cbr: CbrRateProvider,
    private readonly cbrHistory: CbrHistoryProvider,
    private readonly cmc: CmcHistoryProvider,
    private readonly rapira: RapiraRateProvider,
  ) {}

  onApplicationBootstrap(): void {
    void this.refreshOnStartup();
  }

  private async refreshOnStartup(): Promise<void> {
    for (let attempt = 1; attempt <= STARTUP_REFRESH_ATTEMPTS; attempt++) {
      try {
        const n = await this.refreshRates();
        if (n > 0) this.logger.log(`Rates refreshed on startup: ${n}`);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt < STARTUP_REFRESH_ATTEMPTS) {
          this.logger.debug(
            `Rate refresh on startup failed (attempt ${attempt}/${STARTUP_REFRESH_ATTEMPTS}), retrying in ${STARTUP_REFRESH_DELAY_MS / 1000}s: ${msg}`,
          );
          await delay(STARTUP_REFRESH_DELAY_MS);
        } else {
          this.logger.warn(
            `Rate refresh on startup failed after ${STARTUP_REFRESH_ATTEMPTS} attempts: ${msg}`,
          );
        }
      }
    }
    // Independent of the refresh above — different hosts, own availability.
    await this.backfillIfMissing();
  }

  /** Tops the archive up when it does not reach `BACKFILL_FROM` or has a hole. */
  private async backfillIfMissing(): Promise<void> {
    try {
      // Today is excluded: refreshRates() already stamped it and would mask the hole.
      const today = new Date(`${utcDay(new Date())}T00:00:00.000Z`);
      const coverage = await this.daily.coverage(RATE_BASE, today);
      const cutoff = `${BACKFILL_FROM.slice(0, 4)}-02-01`; // year opens after the holidays
      const yesterday = utcDay(new Date(today.getTime() - 86_400_000));
      const missing = (await this.expectedHistoryCodes()).filter((code) => {
        const c = coverage.get(code);
        if (!c) return true;
        if (utcDay(c.first) > cutoff) return true;
        // Recency is judged on USDT alone: CMC quotes every calendar day, while on a CBR
        // series a weekend is indistinguishable from downtime. Downtime hits both, and the
        // backfill refetches everything anyway.
        return code === USDT && utcDay(c.last) < yesterday;
      });
      if (missing.length === 0) return;
      this.logger.log(`Rate history incomplete (${missing.join(', ')}); backfilling all`);
      await this.backfillHistory();
    } catch (e) {
      // Analytics falls back to today's rates — never block boot on this.
      this.logger.warn(
        `Rate history backfill check failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async getEffectiveSettings(): Promise<{ baseCurrency: string; rateSource: 'cbr' | 'manual' }> {
    const s = await this.settings.find();
    // Settings live in the DB; the literals here are only a fallback until the row is created.
    return {
      baseCurrency: s?.baseCurrency ?? 'RUB',
      rateSource: (s?.rateSource ?? 'cbr') as 'cbr' | 'manual',
    };
  }

  /** Latest RUB-per-code rate for every known currency (+ RUB = 1). */
  async getRubRates(): Promise<Map<string, Decimal>> {
    const rows = await this.rates.listByBaseDesc(RATE_BASE);
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
      const { rateSource } = await this.getEffectiveSettings();
      // `day` is the rate's effective date, not the fetch date: from ~11:30 MSK the CBR feed
      // already carries tomorrow's rate.
      const rows: Array<{
        code: string;
        base: string;
        rate: string;
        source: string;
        day: string;
      }> = [];

      if (rateSource === 'cbr') {
        const snapshot = await this.cbr.fetchRates(controller.signal);
        for (const q of snapshot.quotes) {
          rows.push({
            code: q.code,
            base: RATE_BASE,
            rate: q.perRub.toFixed(8),
            source: 'cbr',
            day: snapshot.day,
          });
        }
      } else {
        this.logger.log(`rateSource=${rateSource}: fiat rate refresh skipped`);
      }

      // USDT does not depend on rateSource, so it refreshes either way; a Rapira outage must
      // not cost us the CBR rates already fetched.
      try {
        const usdt = await this.rapira.fetchUsdtRub(controller.signal);
        // Spot is the rate right now, so today.
        rows.push({
          code: USDT,
          base: RATE_BASE,
          rate: usdt.toFixed(8),
          source: 'rapira',
          day: utcDay(new Date()),
        });
      } catch (e) {
        this.logger.warn(`USDT rate refresh failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (rows.length === 0) return 0;
      await this.rates.createMany(
        rows.map(({ code, base, rate, source }) => ({ code, base, rate, source })),
      );
      // Mirror into the archive so the series keeps growing from live data.
      await this.daily.createMany(
        rows.map((r) => ({
          code: r.code,
          base: r.base,
          rateDate: new Date(`${r.day}T00:00:00.000Z`),
          rate: r.rate,
          source: r.source,
        })),
      );
      this.logger.log(`Rates refreshed: ${rows.length}`);
      return rows.length;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Codes the archive should hold. With `rateSource="manual"` no fiat is pulled from CBR. */
  private async expectedHistoryCodes(): Promise<string[]> {
    const { rateSource } = await this.getEffectiveSettings();
    if (rateSource !== 'cbr') return [USDT];
    return [...CBR_CURRENCIES.filter((c) => c !== RATE_BASE), USDT];
  }

  /** Date-indexed archive for past spend. `latest` is passed by callers that already have it. */
  async getHistoricalRates(latest?: Map<string, Decimal>): Promise<HistoricalRates> {
    const [rows, live, { rateSource }] = await Promise.all([
      this.daily.listByBaseAsc(RATE_BASE),
      latest ? Promise.resolve(latest) : this.getRubRates(),
      this.getEffectiveSettings(),
    ]);
    // In manual mode the CBR archive must not override the owner's rates: spend would convert
    // at CBR while service costs used the manual rate.
    const usable = rateSource === 'cbr' ? rows : rows.filter((r) => r.source !== 'cbr');
    return new HistoricalRates(
      usable.map((r) => ({
        code: r.code,
        day: utcDay(r.rateDate),
        rate: new Decimal(r.rate.toString()),
      })),
      live,
    );
  }

  /** Fills the archive from `BACKFILL_FROM`. Idempotent — the unique index skips duplicates. */
  async backfillHistory(): Promise<RateBackfill> {
    const from = new Date(`${BACKFILL_FROM}T00:00:00.000Z`);
    const to = new Date();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BACKFILL_TIMEOUT_MS);
    const failed: string[] = [];
    let inserted = 0;
    const expected = new Set(await this.expectedHistoryCodes());

    try {
      for (const code of CBR_CURRENCIES) {
        if (!expected.has(code)) continue;
        try {
          const quotes = await this.cbrHistory.fetchRange(code, from, to, controller.signal);
          inserted += await this.daily.createMany(
            quotes.map((q) => ({
              code,
              base: RATE_BASE,
              rateDate: new Date(`${q.day}T00:00:00.000Z`),
              rate: q.rate.toFixed(8),
              source: 'cbr',
            })),
          );
        } catch (e) {
          failed.push(code);
          this.logger.warn(
            `Backfill failed for ${code}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      try {
        const quotes = await this.cmc.fetchUsdtRange(from, to, controller.signal);
        inserted += await this.daily.createMany(
          quotes.map((q) => ({
            code: USDT,
            base: RATE_BASE,
            rateDate: new Date(`${q.day}T00:00:00.000Z`),
            rate: q.rate.toFixed(8),
            source: 'cmc',
          })),
        );
      } catch (e) {
        failed.push(USDT);
        this.logger.warn(
          `Backfill failed for ${USDT}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      this.logger.log(`Rate history backfilled: ${inserted} rows since ${BACKFILL_FROM}`);
      return { inserted, from: BACKFILL_FROM, to: utcDay(to), failed };
    } finally {
      clearTimeout(timer);
    }
  }

  async addManualRate(code: string, rate: string): Promise<Rate> {
    const row = await this.rates.create({ code, base: RATE_BASE, rate, source: 'manual' });
    return this.toDto(row);
  }

  /** Latest rate per currency. */
  async listRates(): Promise<Rate[]> {
    const rows = await this.rates.listByBaseDesc(RATE_BASE);
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
