import { ServiceData } from '../connector.interface';
import { StormwallService } from './stormwall.types';

// StormWall exposes no billing data anywhere in the API (verified against the full OpenAPI spec:
// zero price/cost/amount/currency/invoice/payment/tariff fields). USD is just a placeholder unit
// for the always-null account balance, same shape as Hetzner/netcup.
export const STORMWALL_CURRENCY = 'USD';

function parseBillingDay(s: string): Date | undefined {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Map a StormWall service into our domain model. `billingDay` is used as-is for `nextBilling`
// despite some ambiguity over whether it's a cycle-anchor day or the true next-charge date — the
// owner chose to use it anyway. No cost/currency/period anywhere in the API → left unset, the
// owner enters them manually. All StormWall `type`s (service/network/domain/ha_proxy/
// whmcs_service) map to our `other` — none of them fit our `domain`/`cdn` types.
export function mapStormwallService(s: StormwallService, enrichedName?: string): ServiceData {
  return {
    externalId: String(s.serviceId),
    name: enrichedName || s.productName,
    type: 'other',
    nextBilling: parseBillingDay(s.billingDay),
    meta: {
      type: s.type,
      clientName: s.clientName,
      productGroupName: s.productGroupName,
      useStormwallDns: s.useStormwallDns,
      useSsl: s.useSsl,
      disableFw: s.disableFw,
      protectedIps: s.protectedIps,
      ipSetName: s.ipSetName,
    },
  };
}
