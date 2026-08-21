import { Controller, Get, Query } from '@nestjs/common';
import { API, API_SUB, CONTROLLERS_INFO } from '@infra/shared';
import type { Principal } from '../auth/principal';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { RequirePerm } from '../auth/require-perm.decorator';
import { resolveAnalyticsScope } from './scope.util';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsSummaryDto,
  ForecastPointDto,
  ForecastQueryDto,
  SummaryQueryDto,
} from './dto/analytics.dto';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags(CONTROLLERS_INFO.ANALYTICS.TAG)
@ApiBearerAuth()
@Controller(API.ANALYTICS)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(API_SUB.ANALYTICS_SUMMARY)
  @RequirePerm('dashboard:read')
  @ApiOperation({ summary: 'Get analytics summary' })
  @ApiOkResponse({ type: AnalyticsSummaryDto })
  summary(@Query() query: SummaryQueryDto, @CurrentPrincipal() principal: Principal) {
    return this.analytics.summary(resolveAnalyticsScope(principal, query.projects));
  }

  @Get(API_SUB.ANALYTICS_FORECAST)
  @RequirePerm('dashboard:read')
  @ApiOperation({ summary: 'Get spending forecast' })
  @ApiOkResponse({ type: [ForecastPointDto] })
  forecast(@Query() query: ForecastQueryDto, @CurrentPrincipal() principal: Principal) {
    return this.analytics.forecast(
      query.months,
      query.monthsBack,
      resolveAnalyticsScope(principal, query.projects),
    );
  }
}
