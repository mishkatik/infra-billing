import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import { NetangelsCalculation, NetangelsPayment, NetangelsVm } from './netangels.types';

/** Use the provider's full monthly tariff, not the zero cash charge while a prepaid packet is active. */
export function mapNetangelsVm(vm: NetangelsVm, price: NetangelsCalculation): ServiceData {
  const cost = new Decimal(price.full_month_price);
  if (!cost.isFinite() || cost.isNegative()) throw new Error('NetAngels: invalid VM price');
  return {
    externalId: String(vm.id),
    name: vm.name || vm.uid,
    type: 'vps',
    countryCode: 'RU',
    currency: 'RUB',
    cost,
    period: 'monthly',
    nextBilling: null,
    // Explicit allowlist: never persist account details, credentials or arbitrary API responses.
    meta: {
      uid: vm.uid,
      tariff: vm.tariff,
      state: vm.state,
      mainIp: vm.main_ip ?? null,
      diskSize: vm.disk?.size,
      backupEnabled: vm.disk?.is_backup_enabled,
      ips: vm.ips?.map(({ ip, version }) => ({ ip, version })),
      _tariff: {
        priceMonthly: cost.toNumber(),
        priceHourly: price.full_hour_price,
        source: 'cloud/vms/calculation',
        hoursPerMonth: 720,
        prepaidPacket: price.packet != null,
      },
    },
  };
}

/** The finance ledger contains posted account payments, not projected VM charges. */
export function mapNetangelsPayment(payment: NetangelsPayment): PaymentData {
  const date = new Date(`${payment.event_date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== payment.event_date) {
    throw new Error('NetAngels: invalid payment date');
  }
  return {
    externalId: `payment:${payment.id}`,
    type: 'topup',
    amount: new Decimal(payment.amount),
    currency: 'RUB',
    date,
    description: 'NetAngels account payment',
  };
}
