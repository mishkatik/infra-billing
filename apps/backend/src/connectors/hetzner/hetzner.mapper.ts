import Decimal from 'decimal.js';
import { ServiceData } from '../connector.interface';
import { HetznerLocation, HetznerServer } from './hetzner.types';

/** Hetzner location name → ISO country when `location.country` is missing. */
const LOCATION_COUNTRY: Record<string, string> = {
  fsn1: 'DE',
  nbg1: 'DE',
  hel1: 'FI',
  ash: 'US',
  hil: 'US',
  sin: 'SG',
};

function resolveLocation(s: HetznerServer): HetznerLocation | undefined {
  return s.location ?? s.datacenter?.location;
}

function locationToCountry(loc?: HetznerLocation): string | undefined {
  const iso = loc?.country?.toUpperCase();
  if (iso && /^[A-Z]{2}$/.test(iso)) return iso;
  if (!loc?.name) return undefined;
  return LOCATION_COUNTRY[loc.name.toLowerCase()];
}

/** Map a Hetzner Cloud server to our domain Service (price = monthly cap, gross). */
export function mapHetznerServer(s: HetznerServer): ServiceData {
  const loc = resolveLocation(s);
  const locName = loc?.name;
  const price =
    s.server_type?.prices?.find((p) => p.location === locName) ?? s.server_type?.prices?.[0];
  const monthly = price?.price_monthly?.gross;
  const hourly = price?.price_hourly?.gross;
  return {
    externalId: String(s.id),
    name: s.name,
    type: 'vps',
    countryCode: locationToCountry(loc),
    cost: monthly ? new Decimal(monthly) : undefined,
    currency: 'EUR',
    period: 'monthly',
    nextBilling: null,
    meta: price
      ? {
          ...s,
          _tariff: { serverType: s.server_type?.name, priceMonthly: monthly, priceHourly: hourly },
        }
      : { ...s },
  };
}
