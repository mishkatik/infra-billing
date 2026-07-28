import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { API, API_SUB, CONTROLLERS_INFO } from '@infra/shared';
import { CurrencyService } from './currency.service';
import { CreateRateDto, RateDto, RatesBackfillDto, RatesRefreshDto } from './dto/rate.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags(CONTROLLERS_INFO.RATES.TAG)
@ApiBearerAuth()
@Controller(API.RATES)
export class RatesController {
  constructor(private readonly currency: CurrencyService) {}

  @Get()
  @ApiOperation({ summary: 'List exchange rates' })
  @ApiOkResponse({ type: [RateDto] })
  list() {
    return this.currency.listRates();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Add manual rate' })
  @ApiCreatedResponse({ type: RateDto })
  addManual(@Body() dto: CreateRateDto) {
    return this.currency.addManualRate(dto.code, dto.rate);
  }

  @Post(API_SUB.RATES_REFRESH)
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh rates from source' })
  @ApiOkResponse({ type: RatesRefreshDto })
  async refresh() {
    return { updated: await this.currency.refreshRates() };
  }

  @Post(API_SUB.RATES_BACKFILL)
  @HttpCode(200)
  @ApiOperation({ summary: 'Backfill historical daily rates' })
  @ApiOkResponse({ type: RatesBackfillDto })
  backfill() {
    return this.currency.backfillHistory();
  }
}
