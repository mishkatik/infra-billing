import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { SessionOnly } from '../auth/session-only.decorator';
import { ApiTokensService } from './api-tokens.service';
import { ApiTokenDto, CreateApiTokenDto, CreatedApiTokenDto } from './dto/api-token.dto';

// Session-only: API tokens can't manage API tokens — only the admin login (cookie) can.
@ApiTags(CONTROLLERS_INFO.API_TOKENS.TAG)
@ApiBearerAuth()
@SessionOnly()
@Controller(API.TOKENS)
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  @ApiOperation({ summary: 'List API tokens' })
  @ApiOkResponse({ type: [ApiTokenDto] })
  list() {
    return this.tokens.list();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create an API token' })
  @ApiCreatedResponse({ type: CreatedApiTokenDto })
  create(@Body() dto: CreateApiTokenDto) {
    return this.tokens.create(dto);
  }

  @Delete(API_SUB.BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an API token' })
  @ApiNoContentResponse()
  remove(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.tokens.remove(uuid);
  }
}
