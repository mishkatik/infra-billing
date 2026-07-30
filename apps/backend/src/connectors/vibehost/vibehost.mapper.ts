import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import { VibehostDedicated, VibehostTransaction, VibehostVps } from './vibehost.types';

const LOCATION_COUNTRIES: Record<string, string> = {
  ash: 'US',
  fsn: 'DE',
  hel: 'FI',
  hil: 'US',
  nbg: 'DE',
};

function parseDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function countryFor(location?: string | null): string | undefined {
  if (!location) return undefined;
  return LOCATION_COUNTRIES[location.toLowerCase().slice(0, 3)];
}

function monthlyCost(value?: number | null): Decimal | undefined {
  return value == null ? undefined : new Decimal(String(value));
}

export function mapVibehostVps(server: VibehostVps): ServiceData {
  return {
    externalId: `vps:${server.id}`,
    name: server.label || server.name || server.ip || `vps-${server.id}`,
    type: 'vps',
    countryCode: countryFor(server.location),
    cost: monthlyCost(server.monthlyBill),
    currency: 'USD',
    period: 'monthly',
    nextBilling: parseDate(server.paidTill),
    meta: {
      ip: server.ip,
      ipv6: server.ipv6,
      serverId: server.serverId,
      serverType: server.type,
      lifecycle: server.lifecycle,
      blocked: server.blocked,
      location: server.location,
      backups: server.backupEnabled,
      infrastructureProvider: server.provider,
    },
  };
}

export function mapVibehostDedicated(server: VibehostDedicated): ServiceData {
  return {
    externalId: `dedicated:${server.id}`,
    name: server.label || server.serverNumber || server.serverIp || `dedicated-${server.id}`,
    type: 'dedicated',
    countryCode: countryFor(server.location),
    cost: monthlyCost(server.renewalPrice ?? server.monthlyBill),
    currency: 'USD',
    period: 'monthly',
    nextBilling: parseDate(server.paidTill),
    meta: {
      ip: server.serverIp,
      serverNumber: server.serverNumber,
      productId: server.productId,
      status: server.status,
      lifecycle: server.lifecycle,
      blocked: server.blocked,
      location: server.location,
      auction: server.auction,
      windows: server.windowsEnabled,
      infrastructureProvider: server.provider,
    },
  };
}

export function mapVibehostTransaction(transaction: VibehostTransaction): PaymentData {
  const date = parseDate(transaction.createdAt) ?? new Date(0);
  return {
    externalId: `transaction:${transaction.id}`,
    type: transaction.amount >= 0 ? 'topup' : 'charge',
    amount: new Decimal(String(transaction.amount)).abs(),
    currency: 'USD',
    date,
    description: transaction.description || transaction.type,
  };
}
