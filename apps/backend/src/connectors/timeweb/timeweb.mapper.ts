import Decimal from 'decimal.js';
import { ServiceData } from '../connector.interface';
import { TimewebPreset, TimewebServer, TimewebServiceCost } from './timeweb.types';

const HOURS_PER_MONTH = 730; // Timeweb hourly_cost ≈ monthly_cost / 730

// Map Timeweb location prefixes (e.g. "ru-1") to ISO 3166-1 alpha-2 codes.
const LOCATION_COUNTRY: Record<string, string> = {
  ru: 'RU',
  pl: 'PL',
  nl: 'NL',
  kz: 'KZ',
  de: 'DE',
};

function locationToCountry(location?: string): string | undefined {
  if (!location) return undefined;
  const prefix = location.split('-')[0]?.toLowerCase();
  return prefix ? LOCATION_COUNTRY[prefix] : undefined;
}

function resolveMonthlyCost(
  serviceCost: TimewebServiceCost | undefined,
  preset: TimewebPreset | undefined,
): Decimal | undefined {
  // Prefer account services/cost: covers configurator VPS and includes add-ons in total_cost.
  if (serviceCost) {
    const amount = serviceCost.total_cost ?? serviceCost.cost;
    if (amount != null && Number.isFinite(amount)) return new Decimal(amount);
  }
  if (preset) return new Decimal(preset.price);
  return undefined;
}

function buildMeta(
  s: TimewebServer,
  preset: TimewebPreset | undefined,
  serviceCost: TimewebServiceCost | undefined,
  monthly: Decimal | undefined,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...s };
  if (preset || monthly) {
    const priceMonthly = monthly?.toNumber() ?? preset?.price;
    meta._tariff = {
      presetId: preset?.id ?? null,
      configuratorId: s.configurator_id ?? null,
      priceMonthly,
      priceHourly:
        priceMonthly != null
          ? new Decimal(priceMonthly).div(HOURS_PER_MONTH).toDecimalPlaces(2).toNumber()
          : undefined,
      baseCost: serviceCost?.cost,
      totalCost: serviceCost?.total_cost,
      description: serviceCost?.info?.description,
    };
  }
  return meta;
}

/** Map a Timeweb server (+ optional services/cost row and preset) to our domain Service. */
export function mapTimewebServer(
  s: TimewebServer,
  presets: Map<number, TimewebPreset>,
  costs: Map<number, TimewebServiceCost>,
): ServiceData {
  const preset = typeof s.preset_id === 'number' ? presets.get(s.preset_id) : undefined;
  const serviceCost = costs.get(s.id);
  const location = preset?.location ?? s.location;
  const cost = resolveMonthlyCost(serviceCost, preset);
  return {
    externalId: String(s.id),
    name: s.name,
    type: 'vps',
    countryCode: locationToCountry(location),
    cost,
    period: 'monthly',
    nextBilling: null,
    meta: buildMeta(s, preset, serviceCost, cost),
  };
}
