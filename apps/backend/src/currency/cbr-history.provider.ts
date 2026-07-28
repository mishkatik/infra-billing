import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import Decimal from 'decimal.js';
import { DailyQuote } from './rate-provider.interface';

const CBR_DYNAMIC_URL = 'https://www.cbr.ru/scripts/XML_dynamic.asp';

/** CBR internal ids for XML_dynamic, from XML_valFull.asp. TRY's trailing letter is correct. */
const CBR_CODES: Record<string, string> = {
  USD: 'R01235',
  EUR: 'R01239',
  GBP: 'R01035',
  CHF: 'R01775',
  JPY: 'R01820',
  CNY: 'R01375',
  TRY: 'R01700J',
  KZT: 'R01335',
  UAH: 'R01720',
};

// Flat list of same-shaped records — a parser dependency would not buy anything.
const RECORD_RE =
  /<Record\s+Date="(\d{2}\.\d{2}\.\d{4})"[^>]*>\s*<Nominal>(\d+)<\/Nominal>\s*<Value>([\d,]+)<\/Value>/g;

const pad = (n: number) => String(n).padStart(2, '0');
/** CBR only accepts DD/MM/YYYY — an ISO date silently returns "Error in parameters". */
const cbrDate = (d: Date) =>
  `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

/** Historical CBR rates. One request covers a whole date range for one currency. */
@Injectable()
export class CbrHistoryProvider {
  private readonly logger = new Logger(CbrHistoryProvider.name);

  supports(code: string): boolean {
    return code in CBR_CODES;
  }

  /**
   * Daily RUB-per-`code` quotes for [from, to]. Sparse: CBR publishes only on days a new rate
   * takes effect (Tue-Sat, minus holidays), so callers forward-fill.
   */
  async fetchRange(code: string, from: Date, to: Date, signal: AbortSignal): Promise<DailyQuote[]> {
    const id = CBR_CODES[code];
    if (!id) return [];

    const { data } = await axios.get<ArrayBuffer>(CBR_DYNAMIC_URL, {
      params: { date_req1: cbrDate(from), date_req2: cbrDate(to), VAL_NM_RQ: id },
      responseType: 'arraybuffer', // feed is windows-1251; UTF-8 mangles it
      timeout: 30_000,
      signal,
    });
    const xml = new TextDecoder('windows-1251').decode(new Uint8Array(data));

    // Every CBR error comes back as HTTP 200 with an empty or sentinel body.
    if (xml.includes('Error in parameters')) {
      throw new Error(`CBR rejected the request for ${code} (${id})`);
    }

    const quotes: DailyQuote[] = [];
    RECORD_RE.lastIndex = 0;
    for (let m = RECORD_RE.exec(xml); m !== null; m = RECORD_RE.exec(xml)) {
      const [, date, nominal, value] = m;
      const [dd, mm, yyyy] = date.split('.');
      // Nominal is per-record, not per-currency — CBR flips it to keep Value readable (CNY
      // alone changed 50+ times), so a hardcoded nominal yields 10x-wrong history.
      quotes.push({
        day: `${yyyy}-${mm}-${dd}`,
        rate: new Decimal(value.replace(',', '.')).div(nominal),
      });
    }
    if (quotes.length === 0) {
      this.logger.warn(`CBR returned no records for ${code} (${id})`);
    }
    return quotes;
  }
}
