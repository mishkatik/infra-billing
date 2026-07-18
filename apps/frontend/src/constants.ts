import { useTranslation } from 'react-i18next';
import {
  type Period,
  type ProviderKind,
  type ServiceType,
  SUPPORTED_CURRENCIES,
} from '@infra/shared';

const PERIODS: Period[] = ['monthly', 'yearly', 'quarterly', 'daily', 'hourly', 'onetime'];
const SERVICE_TYPES: ServiceType[] = [
  'vps',
  'dedicated',
  'domain',
  'cdn',
  'storage',
  'db',
  'license',
  'other',
];
const PROVIDER_KINDS: ProviderKind[] = [
  'timeweb',
  'hetzner',
  'netcup',
  'hostbill',
  'billmgr',
  'selectel',
  '4vps',
  'netlen',
  'beget',
  'porkbun',
  'vultr',
  'linode',
  'aeza',
  'vdsina',
  'cloudflare',
  'stormwall',
  'yandex',
  'manual',
];

// Currency codes are language-neutral, so they stay static. Sourced from the shared list so the
// pickers and the CBR rate fetch stay in sync.
export const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }));

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
