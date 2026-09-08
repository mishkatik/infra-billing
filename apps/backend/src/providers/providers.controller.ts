import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { Response } from 'express';
import { SessionOnly } from '../auth/session-only.decorator';
import { NetcupDeviceFlowService } from '../connectors/netcup/netcup.device-flow';
import { FaviconsService } from '../favicons/favicons.service';
import { ProvidersService } from './providers.service';
import {
  CreateProviderDto,
  NetcupDevicePollDto,
  NetcupDevicePollResultDto,
  NetcupDeviceStartDto,
  ProviderCredentialsRevealDto,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

@ApiBearerAuth()
@ApiTags(CONTROLLERS_INFO.PROVIDERS.TAG)
@Controller(API.PROVIDERS)
export class ProvidersController {
  constructor(
    private readonly providers: ProvidersService,
    private readonly netcupDevice: NetcupDeviceFlowService,
    private readonly favicons: FaviconsService,
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

  // Returns decrypted secrets, so it stays off-limits to API tokens: those are unscoped and live in
  // scripts, and a leaked one must not be able to drain every hoster password and TOTP seed.
  @SessionOnly()
  @Get(API_SUB.PROVIDER_CREDENTIALS_REVEAL)
  @ApiOperation({ summary: 'Reveal stored provider credentials (explicit reveal, session only)' })
  @ApiOkResponse({ type: ProviderCredentialsRevealDto })
  revealCredentials(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.providers.revealCredentials(uuid);
  }

  @Get(API_SUB.FAVICON)
  @ApiOperation({ summary: 'Provider favicon (proxied, cached)' })
  @ApiProduces('image/*')
  @ApiOkResponse({ description: 'Favicon image', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'No favicon could be resolved' })
  async favicon(
    @Param(ID_PARAM, ParseUUIDPipe) uuid: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const icon = await this.favicons.getProviderFavicon(uuid);
    // Headers are set here, not via @Header: Nest applies decorator headers before the handler
    // runs, so a 24h Cache-Control would leak onto the 404 and pin a miss in the browser.
    if (!icon) {
      res.setHeader('Cache-Control', 'private, max-age=3600');
      throw new NotFoundException('Favicon not found');
    }
    res.setHeader('Cache-Control', 'private, max-age=86400');
    // A panel's SVG becomes same-origin here; opened as a document it must not run script.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return new StreamableFile(icon.body, { type: icon.contentType });
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
