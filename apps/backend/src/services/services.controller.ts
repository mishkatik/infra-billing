import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { CurrentPrincipal } from '../auth/principal.decorator';
import type { Principal } from '../auth/principal';
import { RequirePerm } from '../auth/require-perm.decorator';
import { ServicesService } from './services.service';
import { CreateServiceDto, ServiceDto, ServiceQueryDto, UpdateServiceDto } from './dto/service.dto';

@ApiTags(CONTROLLERS_INFO.SERVICES.TAG)
@ApiBearerAuth()
@Controller(API.SERVICES)
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequirePerm('services:read')
  @ApiOperation({ summary: 'List services' })
  @ApiOkResponse({ type: [ServiceDto] })
  list(@Query() query: ServiceQueryDto, @CurrentPrincipal() principal: Principal) {
    return this.services.list(query, principal);
  }

  @Post()
  @HttpCode(201)
  @RequirePerm('services:edit')
  @ApiOperation({ summary: 'Create a service' })
  @ApiCreatedResponse({ type: ServiceDto })
  create(@Body() dto: CreateServiceDto, @CurrentPrincipal() principal: Principal) {
    return this.services.create(dto, principal);
  }

  @Patch(API_SUB.BY_ID)
  @RequirePerm('services:edit')
  @ApiOperation({ summary: 'Update a service' })
  @ApiOkResponse({ type: ServiceDto })
  update(
    @Param(ID_PARAM, ParseUUIDPipe) uuid: string,
    @Body() dto: UpdateServiceDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.services.update(uuid, dto, principal);
  }

  @Delete(API_SUB.BY_ID)
  @HttpCode(204)
  @RequirePerm('services:edit')
  @ApiOperation({ summary: 'Delete a service' })
  @ApiNoContentResponse()
  remove(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @CurrentPrincipal() principal: Principal) {
    return this.services.remove(uuid, principal);
  }
}
