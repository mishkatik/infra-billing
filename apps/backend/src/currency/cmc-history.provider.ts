import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import Decimal from 'decimal.js';
import { DailyQuote } from './rate-provider.interface';

const CMC_URL = 'https://api.coinmarketcap.com/data-api/v3.1/cryptocurrency/historical';
const USDT_ID = 825;
const RUB_CONVERT_ID = 2806;
const USER_AGENT = 'infra-billing/1.0'; // CloudFront 403s a request with no UA
const MAX_PAGES = 12;

interface CmcQuote {
  timeOpen: string;
  quote: { close: number; volume: number };
}
interface CmcResponse {
  // `timeEnd` is not the requested value echoed back — it is a cursor to the previous page.
  data?: { timeEnd?: string; quotes?: CmcQuote[] };
}

/**
 * USDT/RUB daily history from CoinMarketCap's public data API. The contract is undocumented and
 * was established against the live endpoint:
 *   - `timeStart` is IGNORED — the window is always 400 daily candles ending on `timeEnd`'s day.
 *   - Paging backwards goes through `data.timeEnd` (first candle − 1 day).
 *   - A `timeEnd` inside the current day drops today's unclosed candle (399 results, not 400).
 *   - Omitting `timeEnd` returns a running candle with volume 0 — never a final close.
 */
@Injectable()
export class CmcHistoryProvider {
  private readonly logger = new Logger(CmcHistoryProvider.name);

  /** Daily RUB-per-USDT closes covering [from, to]. Pages backwards until `from` is reached. */
  async fetchUsdtRange(from: Date, to: Date, signal: AbortSignal): Promise<DailyQuote[]> {
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    const byDay = new Map<string, Decimal>();
    let cursor = Math.floor(to.getTime() / 1000);

    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await axios.get<CmcResponse>(CMC_URL, {
        params: {
          id: USDT_ID,
          convertId: RUB_CONVERT_ID,
          timeEnd: cursor,
          interval: 'daily',
        },
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: 30_000,
        signal,
      });

      const quotes = data?.data?.quotes ?? [];
      if (quotes.length === 0) {
        // CMC reports errors with HTTP 200 and an empty payload, so an empty first page is a
        // failure rather than "no more history".
        if (page === 0) throw new Error('CMC returned no USDT quotes');
        break;
      }

      let oldest = '9999-12-31';
      for (const q of quotes) {
        // Key on timeOpen (UTC midnight): timestamp/timeClose are 23:59:59.999 and would shift
        // the archive a day forward in any timezone east of UTC.
        const day = q.timeOpen.slice(0, 10);
        if (day < oldest) oldest = day;
        if (day < fromDay || day > toDay) continue;
        if (!q.quote?.volume || !q.quote.close) continue; // unclosed candle: volume 0
        byDay.set(day, new Decimal(q.quote.close));
      }

      if (oldest <= fromDay) break;
      const next = Number(data?.data?.timeEnd);
      if (!Number.isFinite(next) || next <= 0) {
        this.logger.warn('CMC returned no paging cursor; USDT history may be incomplete');
        break;
      }
      cursor = next;
    }

    return [...byDay]
      .map(([day, rate]) => ({ day, rate }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }
}
