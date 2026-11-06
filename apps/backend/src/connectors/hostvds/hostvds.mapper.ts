import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import {
  HostvdsBrand,
  HostvdsPlan,
  HostvdsRegion,
  HostvdsTransaction,
  NovaServer,
  NovaServersPage,
} from './hostvds.types';

// The panel groups its ledger by Moscow days (UTC+3, no DST).
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Currency of a region's prices: the region's own (usd/eur), unless the brand fixes one. */
export function regionCurrency(region: HostvdsRegion, brand: HostvdsBrand): string {
  return brand.priceCurrency ?? (region.currency || brand.currency).toUpperCase();
}

/** Plan of a server: the region's plan built on the server's flavor. */
export function matchPlan(server: NovaServer, plans: HostvdsPlan[]): HostvdsPlan | undefined {
  const flavorId = server.flavor?.id;
  return flavorId ? plans.find((p) => p.flavor_uuid === flavorId) : undefined;
}

export function money(raw: unknown): Decimal | undefined {
  if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '') return;
  if (!Number.isFinite(Number(raw))) return;
  return new Decimal(String(raw));
}

/** Network plan the server was ordered with (the panel keeps it in the server metadata). */
export function networkPlanOf(server: NovaServer): string | undefined {
  const raw = server.metadata?.network_plan;
  return typeof raw === 'string' && raw ? raw : undefined;
}

/**
 * Monthly price: the flavor plan plus the paid network plan (unlimited traffic / bandwidth). A
 * network plan missing from the plan's options leaves the price empty rather than understated.
 * Traffic over the included allowance is billed separately and not counted.
 */
function monthlyCost(plan: HostvdsPlan | undefined, networkPlan: string | undefined) {
  const base = money(plan?.monthly);
  if (!base || !networkPlan) return base?.toDecimalPlaces(2);
  const option = plan?.extra_opts?.network_opts?.[networkPlan];
  if (!option) return;
  const extra = money(option.monthly_price ?? 0);
  return extra ? base.plus(extra).toDecimalPlaces(2) : undefined;
}

function ips(server: NovaServer, version: number): string[] {
  return Object.values(server.addresses ?? {})
    .flat()
    .filter((a) => a?.version === version && a.addr)
    .map((a) => a.addr as string);
}

/**
 * Map a Nova server to our domain Service. Nova has no price: the cost is the monthly price of
 * the region's plan for the server's flavor (billed hourly up to that cap) plus its network
 * plan. A flavor missing from the current catalog (a retired plan) leaves the cost empty, since a
 * wrong price is worse than a missing one; the sync then keeps the previous cost. The currency is
 * always the region's, so a kept cost never changes its currency under it.
 */
export function mapHostvdsServer(
  server: NovaServer,
  region: HostvdsRegion,
  plans: HostvdsPlan[],
  brand: HostvdsBrand,
): ServiceData {
  const plan = matchPlan(server, plans);
  const networkPlan = networkPlanOf(server);
  return {
    externalId: server.id,
    name: server.name || `server-${server.id}`,
    type: plan?.kind === 'baremetal' ? 'dedicated' : 'vps',
    countryCode: region.country_code ? region.country_code.toUpperCase() : undefined,
    cost: monthlyCost(plan, networkPlan),
    currency: regionCurrency(region, brand),
    period: 'monthly',
    // Curated meta. Never copy `metadata` whole: OpenStack images may keep secrets there.
    meta: {
      region: region.region,
      city: region.city_code,
      status: server.status,
      created: server.created,
      flavorId: server.flavor?.id,
      plan: plan?.name,
      networkPlan,
      ipv4: ips(server, 4),
      ipv6: ips(server, 6),
    },
  };
}

/** Marker of the next Nova page from `servers_links`, or undefined on the last page. */
export function nextMarker(links: NovaServersPage['servers_links']): string | undefined {
  const href = links?.find((l) => l.rel === 'next' && l.href)?.href;
  if (!href) return;
  try {
    return new URL(href).searchParams.get('marker') || undefined;
  } catch {
    return;
  }
}

const moscowDay = (d: Date) => new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);

/**
 * The website ledger as payments. Top-ups come one row each. Charges come one row per server
 * product (instance, traffic, ip) per billing run, so they are summed into one charge per server
 * per Moscow day, linked to the server's service. Only settled rows (`status: ok`) moved money;
 * a day that rounds to less than a cent is dropped.
 */
export function mapHostvdsPayments(rows: HostvdsTransaction[], currency: string): PaymentData[] {
  const out: PaymentData[] = [];
  const charges = new Map<
    string,
    { amount: Decimal; date: Date; serverId?: string; name?: string }
  >();
  for (const t of rows) {
    if (t.status !== 'ok') continue;
    const amount = money(t.amount);
    const date = t.created ? new Date(t.created) : undefined;
    if (!amount || !date || Number.isNaN(date.getTime())) continue;
    if (t.kind === 'refill') {
      out.push({
        externalId: `refill:${t.uuid}`,
        type: 'topup',
        amount: amount.toDecimalPlaces(2),
        currency,
        date,
        description: t.message || undefined,
      });
      continue;
    }
    if (t.kind !== 'invoice') continue;
    const serverId = t.product?.external_id || undefined;
    const key = `${moscowDay(date)}:${serverId ?? 'account'}`;
    const charge = charges.get(key) ?? { amount: new Decimal(0), date, serverId };
    charge.amount = charge.amount.plus(amount);
    if (date > charge.date) charge.date = date;
    // Traffic and IP products are named "<server>'s traffic" / "<server>'s ip".
    const name = t.product?.external_name?.replace(/'s (traffic|ip)$/, '');
    if (name && (t.product?.type === 'instance' || !charge.name)) charge.name = name;
    charges.set(key, charge);
  }
  for (const [key, c] of charges) {
    const amount = c.amount.toDecimalPlaces(2);
    if (amount.lte(0)) continue;
    out.push({
      externalId: `charge:${key}`,
      type: 'charge',
      amount,
      currency,
      date: c.date,
      description: c.name,
      serviceExternalId: c.serverId,
    });
  }
  return out;
}
