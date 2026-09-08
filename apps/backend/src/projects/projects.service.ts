import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { BulkMoveResult, DEFAULT_PROJECT_UUID, Project as ProjectDto } from '@infra/shared';
import { ProjectsRepository } from '@repositories/projects/projects.repository';
import { ServicesRepository } from '@repositories/services/services.repository';
import { mapProject } from '@common/mappers';
import { FaviconsService } from '../favicons/favicons.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly services: ServicesRepository,
    private readonly favicons: FaviconsService,
  ) {}

  async list(): Promise<ProjectDto[]> {
    const rows = await this.projects.listWithCounts();
    return rows.map(mapProject);
  }

  async create(dto: CreateProjectDto): Promise<ProjectDto> {
    const p = await this.projects.create({
      name: dto.name,
      faviconLink: dto.faviconLink || null,
      iconName: dto.iconName ?? null,
      iconBg: dto.iconBg ?? null,
    });
    return mapProject(p);
  }

  async update(uuid: string, dto: UpdateProjectDto): Promise<ProjectDto> {
    await this.ensureExists(uuid);
    const data: Prisma.ProjectUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.faviconLink !== undefined) data.faviconLink = dto.faviconLink || null;
    if (dto.iconName !== undefined) data.iconName = dto.iconName;
    if (dto.iconBg !== undefined) data.iconBg = dto.iconBg;
    const p = await this.projects.update(uuid, data);
    if (dto.faviconLink !== undefined) this.favicons.invalidateProject(uuid);
    return mapProject(p);
  }

  /** Move EVERY service (from any project) into this project. Returns the count actually moved. */
  async moveAllInto(uuid: string): Promise<BulkMoveResult> {
    await this.ensureExists(uuid);
    const moved = await this.services.moveAllToProject(uuid);
    return { moved };
  }

  /** Empty this project: move its services to the default project (services are never deleted). */
  async empty(uuid: string): Promise<BulkMoveResult> {
    await this.ensureExists(uuid);
    if (uuid === DEFAULT_PROJECT_UUID) return { moved: 0 }; // already the sink, nothing to do
    const moved = await this.services.moveProjectServices(uuid, DEFAULT_PROJECT_UUID);
    return { moved };
  }

  async remove(uuid: string): Promise<void> {
    if (uuid === DEFAULT_PROJECT_UUID) {
      throw new BadRequestException('The default project cannot be deleted');
    }
    await this.ensureExists(uuid);
    // onDelete is Restrict, so the repo moves this project's services to the default project first.
    await this.projects.deleteMovingServices(uuid, DEFAULT_PROJECT_UUID);
    this.favicons.invalidateProject(uuid);
  }

  private async ensureExists(uuid: string): Promise<void> {
    if (!(await this.projects.exists(uuid))) throw new NotFoundException('Project not found');
  }
}
