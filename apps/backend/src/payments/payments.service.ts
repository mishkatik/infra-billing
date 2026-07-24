import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedPayments, Payment as PaymentDto } from '@infra/shared';
import { PaymentsRepository } from '@repositories/payments/payments.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { ServicesRepository } from '@repositories/services/services.repository';
import { mapPayment } from '@common/mappers';
import { CreatePaymentDto, PaymentQueryDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly providers: ProvidersRepository,
    private readonly services: ServicesRepository,
  ) {}

  async list(query: PaymentQueryDto): Promise<PaginatedPayments> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { rows, total } = await this.payments.listPaginated(query, page, pageSize);
    return { items: rows.map(mapPayment), total };
  }

  async create(dto: CreatePaymentDto): Promise<PaymentDto> {
    await this.ensureProvider(dto.providerUuid);
    if (dto.serviceUuid) await this.ensureService(dto.serviceUuid);
    const p = await this.payments.create({
      providerUuid: dto.providerUuid,
      serviceUuid: dto.serviceUuid ?? null,
      amount: dto.amount,
      currency: dto.currency,
      description: dto.description ?? null,
      paymentDate: new Date(dto.paymentDate),
      type: dto.type ?? 'topup',
    });
    return mapPayment(p);
  }

  async remove(uuid: string): Promise<void> {
    if (!(await this.payments.exists(uuid))) throw new NotFoundException('Payment not found');
    await this.payments.delete(uuid);
  }

  private async ensureProvider(uuid: string): Promise<void> {
    if (!(await this.providers.exists(uuid))) throw new NotFoundException('Provider not found');
  }

  private async ensureService(uuid: string): Promise<void> {
    if (!(await this.services.exists(uuid))) throw new NotFoundException('Service not found');
  }
}
