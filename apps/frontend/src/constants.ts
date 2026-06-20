import { useTranslation } from 'react-i18next';
import type { Period, ProviderKind, ServiceType } from '@infra/shared';

export const PERIODS: Period[] = ['monthly', 'yearly', 'quarterly', 'daily', 'hourly', 'onetime'];
export const SERVICE_TYPES: ServiceType[] = [
  'vps',
  'dedicated',
  'domain',
  'cdn',
  'storage',
  'db',
  'license',
  'other',
];
export const PROVIDER_KINDS: ProviderKind[] = [
  'timeweb',
  'hetzner',
  'netcup',
  'hostbill',
  'billmgr',
  'selectel',
  '4vps',
  'netlen',
  'manual',
];

// Currency codes are language-neutral, so they stay static.
export const CURRENCY_OPTIONS = ['RUB', 'USD', 'EUR', 'KZT', 'CNY'].map((c) => ({
  value: c,
  label: c,
}));

/**
 * Translated labels and `<Select>` options for the domain enums. The underlying values
 * (`monthly`, `vps`, `timeweb`, …) are stable; only the displayed label is localized.
 */
export function useEnums() {
  const { t } = useTranslation();
  const periodLabel = (p: string) => t(`enums.period.${p}`, p);
  const serviceTypeLabel = (s: string) => t(`enums.serviceType.${s}`, s);
  const providerKindLabel = (k: string) => t(`enums.providerKind.${k}`, k);
  const rateSourceLabel = (r: string) => t(`enums.rateSource.${r}`, r);

  return {
    periodLabel,
    serviceTypeLabel,
    providerKindLabel,
    rateSourceLabel,
    periodOptions: PERIODS.map((value) => ({ value, label: periodLabel(value) })),
    serviceTypeOptions: SERVICE_TYPES.map((value) => ({ value, label: serviceTypeLabel(value) })),
    providerKindOptions: PROVIDER_KINDS.map((value) => ({
      value,
      label: providerKindLabel(value),
    })),
    currencyOptions: CURRENCY_OPTIONS,
  };
}
