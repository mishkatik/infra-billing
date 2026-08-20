import { ServiceData } from '../connector.interface';
import { SpaceshipDomain } from './spaceship.types';

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Map a Spaceship domain to our Service. The API exposes no renewal pricing, so cost is left
 * unset (the owner edits it); domains have no location so countryCode is left unset.
 */
export function mapSpaceshipDomain(d: SpaceshipDomain): ServiceData {
  return {
    externalId: d.name,
    name: d.unicodeName || d.name,
    type: 'domain',
    currency: 'USD',
    period: 'yearly',
    nextBilling: parseDate(d.expirationDate),
    meta: {
      autoRenew: d.autoRenew,
      isPremium: d.isPremium,
      lifecycleStatus: d.lifecycleStatus,
      registrationDate: d.registrationDate,
      ...(d.unicodeName && d.unicodeName !== d.name ? { punycode: d.name } : {}),
    },
  };
}
