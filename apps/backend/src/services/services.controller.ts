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
import { ServicesService } from './services.service';
import { ApiZodQuery } from '@common/api-zod-query.decorator';
import {
  CreateServiceDto,
  ServiceDto,
  ServiceQueryDto,
  serviceQuerySchema,
  UpdateServiceDto,
} from './dto/service.dto';

@ApiTags(CONTROLLERS_INFO.SERVICES.TAG)
@ApiBearerAuth()
@Controller(API.SERVICES)
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'List services' })
  @ApiOkResponse({ type: [ServiceDto] })
  @ApiZodQuery(serviceQuerySchema)
  list(@Query() query: ServiceQueryDto) {
    return this.services.list(query);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a service' })
  @ApiCreatedResponse({ type: ServiceDto })
  create(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @Patch(API_SUB.BY_ID)
  @ApiOperation({ summary: 'Update a service' })
  @ApiOkResponse({ type: ServiceDto })
  update(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(uuid, dto);
  }

  @Delete(API_SUB.BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a service' })
  @ApiNoContentResponse()
  remove(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.services.remove(uuid);
  }
}
