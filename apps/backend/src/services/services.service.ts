import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { Service as ServiceDto, type ServiceClientMeta } from '@infra/shared';
import { ProjectsRepository } from '@repositories/projects/projects.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { ServicesRepository } from '@repositories/services/services.repository';
import { mapService } from '@common/mappers';
import { CreateServiceDto, ServiceQueryDto, UpdateServiceDto } from './dto/service.dto';

/** Decimal money string, as produced by toFixed(2) and accepted by the API. */
const MONEY_RE = /^-?\d+(\.\d{1,2})?$/;

const CLIENT_META_KEYS = ['vendor', 'marker', 'markerBg'] as const;

function applyClientMeta(
  meta: Record<string, unknown>,
  patch: ServiceClientMeta | undefined,
): boolean {
  if (!patch) return false;
  let dirty = false;
  for (const key of CLIENT_META_KEYS) {
    if (!(key in patch)) continue;
    const next = patch[key];
    if (next === null || next === undefined || next === '') {
      if (key in meta) {
        delete meta[key];
        dirty = true;
      }
    } else if (meta[key] !== next) {
      meta[key] = next;
      dirty = true;
    }
  }
  return dirty;
}

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
    const meta: Record<string, unknown> = {};
    applyClientMeta(meta, dto.meta);
    const s = await this.services.create({
      providerUuid: dto.providerUuid,
      projectUuid: dto.projectUuid,
      name: dto.name,
      description: dto.description || null,
      type: dto.type,
      cost: dto.cost,
      currency: dto.currency,
      period: dto.period,
      countryCode: dto.countryCode ?? 'XX',
      nextBillingAt: dto.nextBillingAt ? new Date(dto.nextBillingAt) : null,
      isActive: dto.isActive ?? true,
      isManaged: false,
      ...(Object.keys(meta).length > 0 ? { meta: meta as Prisma.InputJsonValue } : {}),
    });
    return mapService(s);
  }

  async update(uuid: string, dto: UpdateServiceDto): Promise<ServiceDto> {
    const existing = await this.services.findByUuid(uuid);
    if (!existing) throw new NotFoundException('Service not found');

    const data: Prisma.ServiceUpdateInput = {};
    const meta = { ...((existing.meta ?? {}) as Record<string, unknown>) };
    let metaDirty = applyClientMeta(meta, dto.meta);

    const baselineName =
      typeof meta.syncedName === 'string'
        ? meta.syncedName
        : !existing.nameOverridden
          ? existing.name
          : undefined;
    const baselineType =
      typeof meta.syncedType === 'string'
        ? meta.syncedType
        : !existing.typeOverridden
          ? existing.type
          : undefined;
    // Guard the stored baseline: meta is free-form JSON, and a malformed string would
    // blow up the Decimal comparison below.
    const syncedCost =
      typeof meta.syncedCost === 'string' && MONEY_RE.test(meta.syncedCost)
        ? meta.syncedCost
        : undefined;
    const baselineCost =
      syncedCost ?? (!existing.costOverridden ? existing.cost.toFixed(2) : undefined);

    // The form submits every field. Mark overridden only when the value leaves the
    // provider baseline; reverting to that baseline clears the flag. Seed synced*
    // on first override so later edits can detect a revert without waiting for sync.
    if (dto.name !== undefined) {
      if (dto.name !== existing.name) data.name = dto.name;
      if (baselineName != null) {
        if (meta.syncedName !== baselineName) {
          meta.syncedName = baselineName;
          metaDirty = true;
        }
        data.nameOverridden = dto.name !== baselineName;
      } else if (dto.name !== existing.name) {
        data.nameOverridden = true;
      }
    }
    if (dto.type !== undefined) {
      if (dto.type !== existing.type) data.type = dto.type;
      if (baselineType != null) {
        if (meta.syncedType !== baselineType) {
          meta.syncedType = baselineType;
          metaDirty = true;
        }
        data.typeOverridden = dto.type !== baselineType;
      } else if (dto.type !== existing.type) {
        data.typeOverridden = true;
      }
    }
    if (dto.cost !== undefined) {
      if (!existing.cost.equals(dto.cost)) data.cost = dto.cost;
      if (baselineCost != null) {
        if (meta.syncedCost !== baselineCost) {
          meta.syncedCost = baselineCost;
          metaDirty = true;
        }
        // Compare numerically, not as strings: the form may submit "10.5" where the
        // baseline is "10.50" — same price, so it must not count as an override.
        data.costOverridden = !new Prisma.Decimal(baselineCost).equals(dto.cost);
      } else if (!existing.cost.equals(dto.cost)) {
        data.costOverridden = true;
      }
    }
    if (metaDirty) data.meta = meta as Prisma.InputJsonValue;
    if (dto.description !== undefined) data.description = dto.description || null;
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
