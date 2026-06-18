import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PaginatedPayments, Payment as PaymentDto } from '@infra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { mapPayment } from '@common/mappers';
import { CreatePaymentDto, PaymentQueryDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PaymentQueryDto): Promise<PaginatedPayments> {
    const where: Prisma.PaymentWhereInput = {};
    if (query.providerUuid) where.providerUuid = query.providerUuid;
    if (query.serviceUuid) where.serviceUuid = query.serviceUuid;
    if (query.from || query.to) {
      where.paymentDate = { gte: query.from, lte: query.to };
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { items: rows.map(mapPayment), total };
  }

  async create(dto: CreatePaymentDto): Promise<PaymentDto> {
    await this.ensureProvider(dto.providerUuid);
    if (dto.serviceUuid) await this.ensureService(dto.serviceUuid);
    const p = await this.prisma.payment.create({
      data: {
        providerUuid: dto.providerUuid,
        serviceUuid: dto.serviceUuid ?? null,
        amount: dto.amount,
        currency: dto.currency,
        description: dto.description ?? null,
        paymentDate: new Date(dto.paymentDate),
      },
    });
    return mapPayment(p);
  }

  async remove(uuid: string): Promise<void> {
    const found = await this.prisma.payment.findUnique({ where: { uuid }, select: { uuid: true } });
    if (!found) throw new NotFoundException('Payment not found');
    await this.prisma.payment.delete({ where: { uuid } });
  }

  private async ensureProvider(uuid: string): Promise<void> {
    const found = await this.prisma.provider.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    if (!found) throw new NotFoundException('Provider not found');
  }

  private async ensureService(uuid: string): Promise<void> {
    const found = await this.prisma.service.findUnique({ where: { uuid }, select: { uuid: true } });
    if (!found) throw new NotFoundException('Service not found');
  }
}
