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
import { API, API_SUB, CONTROLLERS_INFO, ID_PARAM } from '@infra/shared';
import { Response } from 'express';
import { AnalyticsService } from '../analytics/analytics.service';
import { FaviconsService } from '../favicons/favicons.service';
import { ProjectsService } from './projects.service';
import {
  BulkMoveResultDto,
  CreateProjectDto,
  ProjectDto,
  ProjectStatsDto,
  UpdateProjectDto,
} from './dto/project.dto';

@ApiBearerAuth()
@ApiTags(CONTROLLERS_INFO.PROJECTS.TAG)
@Controller(API.PROJECTS)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly analytics: AnalyticsService,
    private readonly favicons: FaviconsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List projects' })
  @ApiOkResponse({ type: [ProjectDto] })
  list() {
    return this.projects.list();
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a project' })
  @ApiCreatedResponse({ type: ProjectDto })
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(API_SUB.BY_ID)
  @ApiOperation({ summary: 'Update a project' })
  @ApiOkResponse({ type: ProjectDto })
  update(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(uuid, dto);
  }

  @Get(API_SUB.FAVICON)
  @ApiOperation({ summary: 'Project favicon (proxied, cached)' })
  @ApiProduces('image/*')
  @ApiOkResponse({ description: 'Favicon image', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'No favicon could be resolved' })
  async favicon(
    @Param(ID_PARAM, ParseUUIDPipe) uuid: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const icon = await this.favicons.getProjectFavicon(uuid);
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

  @Get(API_SUB.PROJECT_STATS)
  @ApiOperation({ summary: 'Get cost statistics for a project' })
  @ApiOkResponse({ type: ProjectStatsDto })
  stats(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.analytics.projectStats(uuid);
  }

  @Post(API_SUB.PROJECT_MOVE_ALL)
  @ApiOperation({ summary: 'Move all services into this project' })
  @ApiOkResponse({ type: BulkMoveResultDto })
  moveAll(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.projects.moveAllInto(uuid);
  }

  @Post(API_SUB.PROJECT_EMPTY)
  @ApiOperation({ summary: 'Move this project’s services to the default project' })
  @ApiOkResponse({ type: BulkMoveResultDto })
  empty(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.projects.empty(uuid);
  }

  @Delete(API_SUB.BY_ID)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a project' })
  @ApiNoContentResponse()
  remove(@Param(ID_PARAM, ParseUUIDPipe) uuid: string) {
    return this.projects.remove(uuid);
  }
}
