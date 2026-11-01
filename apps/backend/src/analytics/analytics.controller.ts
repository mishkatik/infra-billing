import { Controller, Get, Query } from '@nestjs/common';
import { API, API_SUB, CONTROLLERS_INFO } from '@infra/shared';
import { AnalyticsService } from './analytics.service';
import { ApiZodQuery } from '@common/api-zod-query.decorator';
import {
  AnalyticsSummaryDto,
  ForecastPointDto,
  ForecastQueryDto,
  forecastQuerySchema,
} from './dto/analytics.dto';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags(CONTROLLERS_INFO.ANALYTICS.TAG)
@ApiBearerAuth()
@Controller(API.ANALYTICS)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @ApiOperation({ summary: 'Get analytics summary' })
  @ApiOkResponse({ type: AnalyticsSummaryDto })
  @Get(API_SUB.ANALYTICS_SUMMARY)
  summary() {
    return this.analytics.summary();
  }

  @ApiOperation({ summary: 'Get spending forecast' })
  @ApiOkResponse({ type: [ForecastPointDto] })
  @ApiZodQuery(forecastQuerySchema)
  @Get(API_SUB.ANALYTICS_FORECAST)
  forecast(@Query() query: ForecastQueryDto) {
    return this.analytics.forecast(query.months, query.monthsBack);
  }
}
