import { Injectable } from '@nestjs/common';
import { Payment, Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PaymentFilters {
  providerUuid?: string;
  accountUuid?: string;
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
   * Accounts that have at least one top-up / manual payment (type != `charge`). Used to tell
   * consumption-only accounts (Yandex, Selectel: charges but no top-ups) apart from accounts
   * where top-ups already represent the spend, so charges aren't double-counted. Per account,
   * because each account at a hoster keeps its own ledger.
   */
  async accountUuidsWithTopups(): Promise<string[]> {
    const rows = await this.prisma.payment.findMany({
      where: { type: { not: 'charge' } },
      distinct: ['accountUuid'],
      select: { accountUuid: true },
    });
    return rows.map((r) => r.accountUuid);
  }

  /** The account's `charge` rows dated in [from, to). */
  chargesForAccount(accountUuid: string, from: Date, to: Date) {
    return this.prisma.payment.findMany({
      where: { accountUuid, type: 'charge', paymentDate: { gte: from, lt: to } },
      select: { amount: true, currency: true, paymentDate: true },
    });
  }

  /** Date of the account's first `charge` ever, or null when it has none. */
  async firstChargeAt(accountUuid: string): Promise<Date | null> {
    const row = await this.prisma.payment.findFirst({
      where: { accountUuid, type: 'charge' },
      orderBy: { paymentDate: 'asc' },
      select: { paymentDate: true },
    });
    return row?.paymentDate ?? null;
  }

  /** Earliest payment date per account (any type), used to backdate tariff estimates. */
  async earliestPaymentDateByAccount(): Promise<Map<string, Date>> {
    const rows = await this.prisma.payment.groupBy({
      by: ['accountUuid'],
      _min: { paymentDate: true },
    });
    const map = new Map<string, Date>();
    for (const r of rows) {
      if (r._min.paymentDate) map.set(r.accountUuid, r._min.paymentDate);
    }
    return map;
  }

  async listPaginated(
    filters: PaymentFilters,
    page: number,
    pageSize: number,
  ): Promise<{ rows: Payment[]; total: number }> {
    const where: Prisma.PaymentWhereInput = {};
    if (filters.providerUuid) where.providerUuid = filters.providerUuid;
    if (filters.accountUuid) where.accountUuid = filters.accountUuid;
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

  /** Idempotent import upsert by (accountUuid, externalId); manual payments are never touched. */
  upsertExternal(
    accountUuid: string,
    providerUuid: string,
    externalId: string,
    data: ExternalPaymentData,
  ) {
    return this.prisma.payment.upsert({
      where: { accountUuid_externalId: { accountUuid, externalId } },
      create: { accountUuid, providerUuid, externalId, ...data },
      update: data,
    });
  }

  async delete(uuid: string): Promise<void> {
    await this.prisma.payment.delete({ where: { uuid } });
  }
}
