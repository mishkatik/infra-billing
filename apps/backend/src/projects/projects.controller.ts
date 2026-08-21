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
import { AnalyticsService } from '../analytics/analytics.service';
import { AnyPrincipal } from '../auth/any-principal.decorator';
import type { Principal } from '../auth/principal';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { RequirePerm } from '../auth/require-perm.decorator';
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
  ) {}

  @Get()
  @AnyPrincipal()
  @ApiOperation({ summary: 'List projects' })
  @ApiOkResponse({ type: [ProjectDto] })
  list(@CurrentPrincipal() principal: Principal) {
    return this.projects.list(principal);
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

  @Get(API_SUB.PROJECT_STATS)
  @RequirePerm('dashboard:read')
  @ApiOperation({ summary: 'Get cost statistics for a project' })
  @ApiOkResponse({ type: ProjectStatsDto })
  stats(@Param(ID_PARAM, ParseUUIDPipe) uuid: string, @CurrentPrincipal() principal: Principal) {
    if (principal.kind === 'member' && !principal.projectUuids.includes(uuid)) {
      throw new NotFoundException('Project not found');
    }
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
