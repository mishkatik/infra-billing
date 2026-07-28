import { Injectable } from '@nestjs/common';
import axios from 'axios';
import Decimal from 'decimal.js';

const RATES_URL = 'https://api.rapira.net/open/market/rates';
const USDT_RUB = 'USDT/RUB';

interface RapiraRate {
  symbol: string;
  askPrice: number;
  bidPrice: number;
}

/**
 * Live USDT/RUB spot — the rate roubles are actually convertible at, ~5% above CMC's reference
 * valuation. Spot only: Rapira publishes no history, so the archive comes from CMC.
 */
@Injectable()
export class RapiraRateProvider {
  source(): string {
    return 'rapira';
  }

  /** RUB per 1 USDT. */
  async fetchUsdtRub(signal: AbortSignal): Promise<Decimal> {
    const { data } = await axios.get<{ data: RapiraRate[] }>(RATES_URL, {
      timeout: 15_000,
      signal,
    });
    const item = data?.data?.find((r) => r.symbol === USDT_RUB);
    if (!item) throw new Error(`Rapira: pair ${USDT_RUB} not in response`);

    // askPrice is what you pay to acquire USDT. It is RUB per USDT despite the payload
    // labelling baseCurrency as RUB — direction cannot be read off those field names.
    const rate = new Decimal(item.askPrice);
    if (!rate.isFinite() || rate.lte(0)) {
      throw new Error(`Rapira: implausible ${USDT_RUB} rate ${item.askPrice}`);
    }
    return rate;
  }
}
