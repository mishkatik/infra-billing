import { useTranslation } from 'react-i18next';
import { type Period, type ProviderKind, SERVICE_TYPES, SUPPORTED_CURRENCIES } from '@infra/shared';

const PERIODS: Period[] = ['monthly', 'yearly', 'quarterly', 'daily', 'hourly', 'onetime'];
const PROVIDER_KINDS: ProviderKind[] = [
  'timeweb',
  'hetzner',
  'hostkey',
  'netcup',
  'hostbill',
  'billmgr',
  'selectel',
  '4vps',
  'netlen',
  'beget',
  'porkbun',
  'spaceship',
  'vultr',
  'linode',
  'aeza',
  'vdsina',
  'cloudflare',
  'stormwall',
  'yandex',
  'doubleservers',
  'openrouter',
  'hostup',
  'manual',
];

// Currency codes are language-neutral, so they stay static. Sourced from the shared list so the
// pickers and the CBR rate fetch stay in sync.
export const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }));

// Time zones offered for quiet hours: every Russian zone plus the usual neighbours and world
// cities. Names are in the `timezones` locale; the picker sorts them by the current offset.
export const QUIET_HOURS_TIMEZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Halifax',
  'America/Sao_Paulo',
  'Atlantic/South_Georgia',
  'Atlantic/Azores',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Kaliningrad',
  'Europe/Kyiv',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Minsk',
  'Europe/Moscow',
  'Europe/Samara',
  'Asia/Tbilisi',
  'Asia/Yerevan',
  'Asia/Baku',
  'Asia/Dubai',
  'Asia/Tashkent',
  'Asia/Yekaterinburg',
  'Asia/Almaty',
  'Asia/Kolkata',
  'Asia/Omsk',
  'Asia/Novosibirsk',
  'Asia/Krasnoyarsk',
  'Asia/Bangkok',
  'Asia/Irkutsk',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Yakutsk',
  'Asia/Tokyo',
  'Asia/Vladivostok',
  'Australia/Sydney',
  'Asia/Magadan',
  'Asia/Kamchatka',
  'Pacific/Auckland',
];

// Connector kinds are lowercase codes (timeweb, billmgr, manual, …) shown as-is in every
// locale — netcup-brand style, no prose labels. Locale-independent, so both the label fn and
// the options live at module scope.
const providerKindLabel = (k: string) => k;
const PROVIDER_KIND_OPTIONS = PROVIDER_KINDS.map((value) => ({
  value,
  label: providerKindLabel(value),
}));

// Translated labels + <Select> options for the domain enums; values (monthly, vps, …) stay
// stable, only the displayed label is localized.
export function useEnums() {
  const { t } = useTranslation();
  const periodLabel = (p: string) => t(`enums.period.${p}`, p);
  const serviceTypeLabel = (s: string) => t(`enums.serviceType.${s}`, s);
  const rateSourceLabel = (r: string) => t(`enums.rateSource.${r}`, r);

  return {
    periodLabel,
    serviceTypeLabel,
    providerKindLabel,
    rateSourceLabel,
    periodOptions: PERIODS.map((value) => ({ value, label: periodLabel(value) })),
    serviceTypeOptions: SERVICE_TYPES.map((value) => ({ value, label: serviceTypeLabel(value) })),
    providerKindOptions: PROVIDER_KIND_OPTIONS,
    currencyOptions: CURRENCY_OPTIONS,
  };
}
