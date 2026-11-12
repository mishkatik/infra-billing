import { toDecimal } from '@common/money';
import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import {
  DatapacketInvoice,
  DatapacketServer,
  DatapacketSubscription,
  DatapacketSubscriptionItem,
} from './datapacket.types';

/** DataPacket bills in USD unless the account was set up in EUR/GBP. */
export const DATAPACKET_FALLBACK_CURRENCY = 'USD';

// `LocationIdentifier` enum (schema) → ISO country. Unknown/new locations stay unset ('XX').
const COUNTRY_LOCATIONS: Record<string, string[]> = {
  US: [
    'ASHBURN',
    'ATLANTA',
    'BOSTON',
    'CHICAGO',
    'DALLAS',
    'DENVER',
    'HOUSTON',
    'LOS_ANGELES',
    'MCALLEN',
    'MIAMI',
    'NEW_YORK',
    'SAN_JOSE',
    'SEATTLE',
  ],
  CA: ['CALGARY', 'MONTREAL', 'TORONTO', 'VANCOUVER'],
  MX: ['QUERETARO'],
  BR: ['SAO_PAULO'],
  AR: ['BUENOS_AIRES'],
  CL: ['SANTIAGO'],
  CO: ['BOGOTA'],
  PE: ['LIMA'],
  NL: ['AMSTERDAM'],
  DE: ['BERLIN', 'FRANKFURT'],
  FR: ['BORDEAUX', 'MARSEILLE', 'PARIS'],
  GB: ['LONDON', 'MANCHESTER'],
  ES: ['BARCELONA', 'MADRID'],
  IT: ['MILAN', 'PALERMO'],
  GR: ['ATHENS'],
  SK: ['BRATISLAVA'],
  BE: ['BRUSSELS'],
  RO: ['BUCHAREST'],
  HU: ['BUDAPEST'],
  DK: ['COPENHAGEN'],
  IE: ['DUBLIN'],
  FI: ['HELSINKI'],
  UA: ['KYIV'],
  PT: ['LISBON'],
  NO: ['OSLO'],
  CZ: ['PRAGUE'],
  BG: ['SOFIA'],
  SE: ['STOCKHOLM'],
  AT: ['VIENNA'],
  PL: ['WARSAW'],
  HR: ['ZAGREB'],
  CH: ['ZURICH'],
  TR: ['ISTANBUL'],
  AE: ['FUJAIRAH'],
  IL: ['TEL_AVIV'],
  ZA: ['JOHANNESBURG'],
  NG: ['LAGOS'],
  HK: ['HONG_KONG'],
  SG: ['SINGAPORE'],
  MY: ['KUALA_LUMPUR'],
  JP: ['TOKYO'],
  KR: ['SEOUL'],
  AU: ['MELBOURNE', 'PERTH', 'SYDNEY'],
  NZ: ['AUCKLAND'],
};
export const DATAPACKET_COUNTRY_BY_LOCATION = new Map(
  Object.entries(COUNTRY_LOCATIONS).flatMap(([cc, ids]) => ids.map((id) => [id, cc] as const)),
);

// Invoices settled from already-paid money (DataPacket balance, credit note): counting them
// would double the top-up that funded the balance.
const NON_CASH_METHODS = new Set(['DP_BALANCE', 'CREDIT_NOTE']);

interface Billing {
  period: string;
  /** Multiplier from the per-interval item price to the cost in `period`. */
  factor: Decimal;
  nextBilling: Date | null;
}

/**
 * Item prices are per billing interval (unit × quantity). 1/3/12 months map to our periods;
 * other month counts become a monthly equivalent. Daily cycles are post-paid metering, so they
 * get no dated charge. Trial subscriptions have no cycle → monthly, no date.
 */
export function resolveDatapacketBilling(
  cycle: DatapacketSubscription['billingCycle'],
  now: Date,
): Billing {
  if (!cycle) return { period: 'monthly', factor: new Decimal(1), nextBilling: null };
  if (cycle.unit === 'DAY') {
    return { period: 'daily', factor: new Decimal(1).div(cycle.quantity), nextBilling: null };
  }
  const months = cycle.unit === 'YEAR' ? cycle.quantity * 12 : cycle.quantity;
  const nextBilling = nextCycleStart(cycle, now);
  if (months === 1) return { period: 'monthly', factor: new Decimal(1), nextBilling };
  if (months === 3) return { period: 'quarterly', factor: new Decimal(1), nextBilling };
  if (months === 12) return { period: 'yearly', factor: new Decimal(1), nextBilling };
  return { period: 'monthly', factor: new Decimal(1).div(months), nextBilling: null };
}

/**
 * Next cycle start strictly after `now` (UTC). `start` is the day of month for monthly cycles
 * and the month of year for yearly ones (schema docs). Only single-unit cycles have a
 * computable phase; multi-unit cycles return null.
 */
function nextCycleStart(
  cycle: NonNullable<DatapacketSubscription['billingCycle']>,
  now: Date,
): Date | null {
  if (cycle.quantity !== 1) return null;
  if (cycle.unit === 'MONTH') {
    if (cycle.start < 1 || cycle.start > 31) return null;
    const at = (y: number, m: number) => {
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return new Date(Date.UTC(y, m, Math.min(cycle.start, lastDay)));
    };
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const candidate = at(y, m);
    return candidate > now ? candidate : at(y, m + 1);
  }
  if (cycle.unit === 'YEAR') {
    if (cycle.start < 1 || cycle.start > 12) return null;
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), cycle.start - 1, 1));
    return candidate > now
      ? candidate
      : new Date(Date.UTC(now.getUTCFullYear() + 1, cycle.start - 1, 1));
  }
  return null;
}

function itemCost(item: DatapacketSubscriptionItem, billing: Billing): Decimal {
  const price = toDecimal(item.price);
  if (!price.isFinite()) throw new Error('DataPacket: invalid subscription item price');
  return price.mul(billing.factor).toDecimalPlaces(2);
}

function mapServer(
  server: DatapacketServer,
  item: DatapacketSubscriptionItem,
  sub: DatapacketSubscription,
  billing: Billing,
): ServiceData {
  return {
    externalId: server.name,
    name: server.alias?.trim() || server.name,
    type: server.deviceType && server.deviceType !== 'SERVER' ? 'other' : 'dedicated',
    countryCode: DATAPACKET_COUNTRY_BY_LOCATION.get(server.location?.identifier ?? ''),
    cost: itemCost(item, billing),
    currency: item.currency,
    period: billing.period,
    nextBilling: billing.nextBilling,
    // Explicit allowlist: never persist account details or arbitrary API responses.
    meta: {
      hostname: server.hostname ?? null,
      location: server.location?.name ?? null,
      deviceType: server.deviceType ?? null,
      status: server.statusV2 ?? null,
      subscription: sub.name,
      subscriptionType: sub.type,
      itemDescription: item.description ?? null,
    },
  };
}

/**
 * One service per server (its SERVER item). The subscription's other recurring items (IPs,
 * DDoS, traffic plans, fees) carry no stable id or server link, so they are summed into one
 * "extras" service per subscription — the account total still matches the subscriptions.
 */
export function mapDatapacketSubscription(sub: DatapacketSubscription, now: Date): ServiceData[] {
  const billing = resolveDatapacketBilling(sub.billingCycle, now);
  const servers = new Map<string, ServiceData>();
  const extras: DatapacketSubscriptionItem[] = [];
  for (const item of sub.subscriptionItems) {
    // Mixed currencies would make the summed extras meaningless; fail loudly instead.
    if (item.currency !== sub.currency) throw new Error('DataPacket: mixed subscription currency');
    const server = item.subscriptionItemDetail?.server;
    if (item.type !== 'SERVER' || !server) {
      extras.push(item);
      continue;
    }
    const mapped = mapServer(server, item, sub, billing);
    const prev = servers.get(mapped.externalId);
    // Two SERVER items for one server (e.g. an upgrade line): one service, summed price.
    if (prev?.cost && mapped.cost) mapped.cost = prev.cost.plus(mapped.cost);
    servers.set(mapped.externalId, mapped);
  }
  const out = [...servers.values()];
  const extrasCost = extras.reduce(
    (sum, item) => sum.plus(itemCost(item, billing)),
    new Decimal(0),
  );
  if (!extrasCost.isZero()) {
    const types = [...new Set(extras.map((i) => i.type))].join(', ');
    out.push({
      externalId: `subscription:${sub.name}`,
      name: `${sub.name}: ${types}`,
      type: 'other',
      cost: extrasCost,
      currency: sub.currency,
      period: billing.period,
      nextBilling: billing.nextBilling,
      meta: {
        subscription: sub.name,
        subscriptionType: sub.type,
        items: extras.map((i) => ({
          type: i.type,
          description: i.description ?? null,
          price: toDecimal(i.price).toFixed(2),
        })),
      },
    });
  }
  return out;
}

/**
 * A PAID invoice → top-up (money actually paid in), dated by `paidOn`. Unpaid/past-due
 * invoices, credit notes (total ≤ 0) and invoices settled from the DataPacket balance or a
 * credit note are not payment facts and return null. Invoices stay provider-level.
 */
export function mapDatapacketInvoice(inv: DatapacketInvoice): PaymentData | null {
  if (inv.payment?.status !== 'PAID') return null;
  if (inv.payment.method && NON_CASH_METHODS.has(inv.payment.method)) return null;
  const amount = toDecimal(inv.total).toDecimalPlaces(2);
  if (!amount.isFinite() || amount.lte(0)) return null;
  const date = new Date(inv.payment.paidOn ?? inv.createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return {
    externalId: `invoice:${inv.invoiceNumber}`,
    type: 'topup',
    amount,
    currency: inv.currency,
    date,
    description: `Invoice ${inv.invoiceNumber}`,
  };
}
