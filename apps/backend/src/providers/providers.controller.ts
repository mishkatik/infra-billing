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
} from '@nestjs/common';
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { NetcupDeviceFlowService } from '../connectors/netcup/netcup.device-flow';
import { ProvidersService } from './providers.service';
import {
  CreateProviderDto,
  NetcupDevicePollDto,
  NetcupDevicePollResultDto,
  NetcupDeviceStartDto,
  ProviderDto,
  ProviderWithServicesDto,
  UpdateProviderDto,
  YandexDiscoverDto,
  YandexDiscoverResultDto,
} from './dto/provider.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@ApiBearerAuth()
@ApiTags(CONTROLLERS_INFO.PROVIDERS.TAG)
@Controller(API.PROVIDERS)
export class ProvidersController {
  constructor(
    private readonly providers: ProvidersService,
    private readonly netcupDevice: NetcupDeviceFlowService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List providers' })
  @ApiOkResponse({ type: [ProviderDto] })
  list() {
    return this.providers.list();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a provider' })
  @ApiCreatedResponse({ type: ProviderDto })
  create(@Body() dto: CreateProviderDto) {
    return this.providers.create(dto);
  }

  // netcup OAuth2 device flow. Declared before the `:uuid` routes (static path, no collision).
  @Post(API_SUB.PROVIDER_NETCUP_DEVICE_START)
  @ApiOperation({ summary: 'Start netcup device flow' })
  @ApiOkResponse({ type: NetcupDeviceStartDto })
  netcupDeviceStart() {
    return this.netcupDevice.start();
  }

  @Post(API_SUB.PROVIDER_NETCUP_DEVICE_POLL)
  @HttpCode(200)
  @ApiOperation({ summary: 'Poll netcup device flow' })
  @ApiOkResponse({ type: NetcupDevicePollResultDto })
  netcupDevicePoll(@Body() dto: NetcupDevicePollDto) {
    return this.netcupDevice.poll(dto.deviceCode);
  }

  // Yandex folder / billing-account discovery for the form dropdowns. Static path, before `:uuid`.
  @Post(API_SUB.PROVIDER_YANDEX_DISCOVER)
  @HttpCode(200)
  @ApiOperation({ summary: 'Discover Yandex folders and billing accounts' })
  @ApiOkResponse({ type: YandexDiscoverResultDto })
  yandexDiscover(@Body() dto: YandexDiscoverDto) {
    return this.providers.discoverYandex(dto);
  }

  @Get(API_SUB.BY_ID)
  @ApiOperation({ summary: 'Get provider with services' })
  @ApiOkResponse({ type: ProviderWithServicesDto })
  get(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.providers.getWithServices(uuid);
  }

  @Patch(API_SUB.BY_ID)
  @ApiOperation({ summary: 'Update a provider' })
  @ApiOkResponse({ type: ProviderDto })
  update(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateProviderDto) {
    return this.providers.update(uuid, dto);
  }

  @Delete(API_SUB.BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a provider' })
  @ApiNoContentResponse()
  remove(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.providers.remove(uuid);
  }
}
