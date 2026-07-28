import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CbrRateProvider } from './cbr.rate-provider';
import { CbrHistoryProvider } from './cbr-history.provider';
import { CmcHistoryProvider } from './cmc-history.provider';
import { RapiraRateProvider } from './rapira.rate-provider';
import { RatesController } from './rates.controller';

@Module({
  controllers: [RatesController],
  providers: [
    CurrencyService,
    CbrRateProvider,
    CbrHistoryProvider,
    CmcHistoryProvider,
    RapiraRateProvider,
  ],
  exports: [CurrencyService],
})
export class CurrencyModule {}
