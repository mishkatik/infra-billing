import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { Service as ServiceDto } from '@infra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { mapService } from '@common/mappers';
import { CreateServiceDto, ServiceQueryDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ServiceQueryDto): Promise<ServiceDto[]> {
    const where: Prisma.ServiceWhereInput = {};
    if (query.providerUuid) where.providerUuid = query.providerUuid;
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    const rows = await this.prisma.service.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { payments: true } } },
    });
    return rows.map(mapService);
  }

  async create(dto: CreateServiceDto): Promise<ServiceDto> {
    await this.ensureProvider(dto.providerUuid);
    const s = await this.prisma.service.create({
      data: {
        providerUuid: dto.providerUuid,
        name: dto.name,
        type: dto.type,
        cost: dto.cost,
        currency: dto.currency,
        period: dto.period,
        countryCode: dto.countryCode ?? 'XX',
        nextBillingAt: dto.nextBillingAt ? new Date(dto.nextBillingAt) : null,
        isActive: dto.isActive ?? true,
        isManaged: false,
      },
    });
    return mapService(s);
  }

  async update(uuid: string, dto: UpdateServiceDto): Promise<ServiceDto> {
    await this.ensureExists(uuid);
    const data: Prisma.ServiceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.cost !== undefined) {
      data.cost = dto.cost;
      // Manual price edit — sync must not overwrite it.
      data.costOverridden = true;
    }
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.period !== undefined) data.period = dto.period;
    if (dto.countryCode !== undefined) data.countryCode = dto.countryCode;
    if (dto.nextBillingAt !== undefined) {
      data.nextBillingAt = dto.nextBillingAt ? new Date(dto.nextBillingAt) : null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const s = await this.prisma.service.update({ where: { uuid }, data });
    return mapService(s);
  }

  async remove(uuid: string): Promise<void> {
    await this.ensureExists(uuid);
    await this.prisma.service.delete({ where: { uuid } });
  }

  private async ensureExists(uuid: string): Promise<void> {
    const found = await this.prisma.service.findUnique({ where: { uuid }, select: { uuid: true } });
    if (!found) throw new NotFoundException('Service not found');
  }

  private async ensureProvider(uuid: string): Promise<void> {
    const found = await this.prisma.provider.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    if (!found) throw new NotFoundException('Provider not found');
  }
}
