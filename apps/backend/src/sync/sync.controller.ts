import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { SyncRunDto, SyncSummaryDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiBearerAuth()
@ApiTags(CONTROLLERS_INFO.SYNC.TAG)
@Controller(API.PROVIDERS)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  // Declared before ':uuid/sync' so the static path isn't captured as a uuid.
  @Post(API_SUB.PROVIDER_SYNC_ALL)
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync all provider accounts' })
  @ApiOkResponse({ type: SyncSummaryDto })
  triggerAll() {
    return this.sync.syncAll();
  }

  @Post(API_SUB.PROVIDER_SYNC)
  @HttpCode(200)
  @ApiOperation({ summary: 'Sync every enabled account of a provider' })
  @ApiOkResponse({ type: SyncSummaryDto })
  trigger(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.sync.syncProvider(uuid);
  }
}

@ApiBearerAuth()
@ApiTags(CONTROLLERS_INFO.SYNC.TAG)
@Controller(API.PROVIDER_ACCOUNTS)
export class AccountSyncController {
  constructor(private readonly sync: SyncService) {}

  @Post(API_SUB.ACCOUNT_SYNC)
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger account sync' })
  @ApiOkResponse({ type: SyncRunDto })
  trigger(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.sync.syncAccount(uuid);
  }

  @Get(API_SUB.ACCOUNT_SYNC_RUNS)
  @ApiOperation({ summary: 'List account sync runs' })
  @ApiOkResponse({ type: [SyncRunDto] })
  syncRuns(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.sync.listSyncRuns(uuid);
  }
}
