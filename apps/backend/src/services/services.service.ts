import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { Service as ServiceDto } from '@infra/shared';
import { ProjectsRepository } from '@repositories/projects/projects.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { ServicesRepository } from '@repositories/services/services.repository';
import { mapService } from '@common/mappers';
import { CreateServiceDto, ServiceQueryDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(
    private readonly services: ServicesRepository,
    private readonly providers: ProvidersRepository,
    private readonly projects: ProjectsRepository,
  ) {}

  async list(query: ServiceQueryDto): Promise<ServiceDto[]> {
    const rows = await this.services.listFiltered(query);
    return rows.map(mapService);
  }

  async create(dto: CreateServiceDto): Promise<ServiceDto> {
    await this.ensureProvider(dto.providerUuid);
    await this.ensureProject(dto.projectUuid);
    const s = await this.services.create({
      providerUuid: dto.providerUuid,
      projectUuid: dto.projectUuid,
      name: dto.name,
      type: dto.type,
      cost: dto.cost,
      currency: dto.currency,
      period: dto.period,
      countryCode: dto.countryCode ?? 'XX',
      nextBillingAt: dto.nextBillingAt ? new Date(dto.nextBillingAt) : null,
      isActive: dto.isActive ?? true,
      isManaged: false,
    });
    return mapService(s);
  }

  async update(uuid: string, dto: UpdateServiceDto): Promise<ServiceDto> {
    const existing = await this.services.findByUuid(uuid);
    if (!existing) throw new NotFoundException('Service not found');

    const data: Prisma.ServiceUpdateInput = {};
    // The form submits every field, so compare with the stored value: only a real
    // manual edit sets the overridden flag (sync must not overwrite such fields).
    if (dto.name !== undefined && dto.name !== existing.name) {
      data.name = dto.name;
      data.nameOverridden = true;
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.cost !== undefined && !existing.cost.equals(dto.cost)) {
      data.cost = dto.cost;
      data.costOverridden = true;
    }
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.period !== undefined) data.period = dto.period;
    if (dto.countryCode !== undefined) data.countryCode = dto.countryCode;
    if (dto.nextBillingAt !== undefined) {
      data.nextBillingAt = dto.nextBillingAt ? new Date(dto.nextBillingAt) : null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.projectUuid !== undefined) {
      await this.ensureProject(dto.projectUuid);
      data.project = { connect: { uuid: dto.projectUuid } };
    }

    // Provider can only change for manual services: a synced one is matched by
    // (providerUuid, externalId), so moving it would orphan it from sync.
    const moving = dto.providerUuid !== undefined && dto.providerUuid !== existing.providerUuid;
    if (!moving) {
      const s = await this.services.update(uuid, data);
      return mapService(s);
    }
    if (existing.isManaged) {
      throw new ConflictException('Cannot change the provider of a synced service');
    }
    const newProviderUuid = dto.providerUuid as string;
    await this.ensureProvider(newProviderUuid);
    // Payments are re-linked to the new provider inside the same transaction.
    const s = await this.services.moveToProvider(uuid, newProviderUuid, data);
    return mapService(s);
  }

  async remove(uuid: string): Promise<void> {
    if (!(await this.services.exists(uuid))) throw new NotFoundException('Service not found');
    await this.services.delete(uuid);
  }

  private async ensureProvider(uuid: string): Promise<void> {
    if (!(await this.providers.exists(uuid))) throw new NotFoundException('Provider not found');
  }

  private async ensureProject(uuid: string): Promise<void> {
    if (!(await this.projects.exists(uuid))) throw new NotFoundException('Project not found');
  }
}
