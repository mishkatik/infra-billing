import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePerm } from '../auth/require-perm.decorator';
import { AnalyticsService } from './analytics.service';
import { BalanceHistoryQueryDto, BalancePointDto } from './dto/analytics.dto';

@ApiTags(CONTROLLERS_INFO.BALANCE_HISTORY.TAG)
@ApiBearerAuth()
@Controller(API.PROVIDERS)
export class BalanceHistoryController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(API_SUB.PROVIDER_BALANCE_HISTORY)
  @RequirePerm('providers:read')
  @ApiOperation({ summary: 'Get provider balance history' })
  @ApiOkResponse({ type: [BalancePointDto] })
  history(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Query() query: BalanceHistoryQueryDto) {
    return this.analytics.balanceHistory(uuid, query.from, query.to);
  }
}
