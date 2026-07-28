import { Injectable } from '@nestjs/common';
import { CBR_CURRENCIES } from '@infra/shared';
import axios from 'axios';
import Decimal from 'decimal.js';
import { RateProvider, RateQuote, RateSnapshot } from './rate-provider.interface';

const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
// CBR publishes ~55 currencies daily; we only keep the ones the panel supports.
const SUPPORTED = new Set<string>(CBR_CURRENCIES);

interface CbrValute {
  Nominal: number;
  Value: number;
  CharCode: string;
}
interface CbrResponse {
  Date: string; // effective date, "2026-07-29T11:30:00+03:00"
  Valute: Record<string, CbrValute>;
}

/** Central Bank of Russia daily rates. Base = RUB; rate of X = Value / Nominal. */
@Injectable()
export class CbrRateProvider implements RateProvider {
  source(): string {
    return 'cbr';
  }

  async fetchRates(signal: AbortSignal): Promise<RateSnapshot> {
    const { data } = await axios.get<CbrResponse>(CBR_URL, { timeout: 10_000, signal });
    const quotes: RateQuote[] = Object.values(data.Valute)
      .filter((v) => SUPPORTED.has(v.CharCode))
      .map((v) => ({
        code: v.CharCode,
        perRub: new Decimal(v.Value).div(v.Nominal),
      }));
    quotes.push({ code: 'RUB', perRub: new Decimal(1) }); // base, not in the CBR feed
    // Take the date as CBR writes it: via UTC the 11:30+03:00 stamp would slip a day back.
    const day = /^\d{4}-\d{2}-\d{2}/.exec(data.Date ?? '')?.[0];
    return { day: day ?? new Date().toISOString().slice(0, 10), quotes };
  }
}
