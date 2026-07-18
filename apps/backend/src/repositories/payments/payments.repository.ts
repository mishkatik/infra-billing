import { Injectable } from '@nestjs/common';
import { Payment, Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PaymentFilters {
  providerUuid?: string;
  serviceUuid?: string;
  from?: Date;
  to?: Date;
}

/** Fields refreshed on every re-import of an external payment record. */
interface ExternalPaymentData {
  amount: string;
  currency: string;
  type: string;
  description: string | null;
  paymentDate: Date;
  serviceUuid: string | null;
}

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.payment.findMany();
  }

  /** All payments since `from` (any type); the caller decides which count as spend. */
  listSince(from: Date) {
    return this.prisma.payment.findMany({ where: { paymentDate: { gte: from } } });
  }

  /**
   * Provider uuids that have at least one top-up / manual payment (type != `charge`). Used to tell
   * consumption-only providers (Yandex, Selectel — charges but no top-ups) apart from providers
   * where top-ups already represent the spend, so charges aren't double-counted.
   */
  async providerUuidsWithTopups(): Promise<string[]> {
    const rows = await this.prisma.payment.findMany({
      where: { type: { not: 'charge' } },
      distinct: ['providerUuid'],
      select: { providerUuid: true },
    });
    return rows.map((r) => r.providerUuid);
  }

  async listPaginated(
    filters: PaymentFilters,
    page: number,
    pageSize: number,
  ): Promise<{ rows: Payment[]; total: number }> {
    const where: Prisma.PaymentWhereInput = {};
    if (filters.providerUuid) where.providerUuid = filters.providerUuid;
    if (filters.serviceUuid) where.serviceUuid = filters.serviceUuid;
    if (filters.from || filters.to) {
      where.paymentDate = { gte: filters.from, lte: filters.to };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { rows, total };
  }

  async exists(uuid: string): Promise<boolean> {
    const found = await this.prisma.payment.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    return found !== null;
  }

  create(data: Prisma.PaymentUncheckedCreateInput) {
    return this.prisma.payment.create({ data });
  }

  /** Idempotent import upsert by (providerUuid, externalId); manual payments are never touched. */
  upsertExternal(providerUuid: string, externalId: string, data: ExternalPaymentData) {
    return this.prisma.payment.upsert({
      where: { providerUuid_externalId: { providerUuid, externalId } },
      create: { providerUuid, externalId, ...data },
      update: data,
    });
  }

  async delete(uuid: string): Promise<void> {
    await this.prisma.payment.delete({ where: { uuid } });
  }
}
