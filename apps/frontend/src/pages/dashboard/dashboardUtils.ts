import type { BillingSeverity } from '@infra/shared';
import type { TFunction } from 'i18next';

// Slice palette shared by the dashboard donuts and forecast series.
export const DONUT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#e64980',
  '#15aabf',
  '#82c91e',
];

// Severity → soft-tinted badge classes (critical=destructive, warning=warning, ok=success).
export const severityBadgeClass = (s: BillingSeverity): string =>
  s === 'critical'
    ? 'border-transparent bg-destructive/15 text-destructive'
    : s === 'warning'
      ? 'border-transparent bg-warning/15 text-warning'
      : 'border-transparent bg-success/15 text-success';

// Severity → text accent for the row title; ok rows keep the default foreground.
export const severityTextClass = (s: BillingSeverity): string | undefined =>
  s === 'critical' ? 'text-destructive' : s === 'warning' ? 'text-warning' : undefined;

export const dayLabel = (t: TFunction, n: number) =>
  n <= 0
    ? t('dashboard.due.today')
    : n === 1
      ? t('dashboard.due.tomorrow')
      : t('dashboard.due.inDays', { n });

export const agoLabel = (t: TFunction, n: number) =>
  n <= 0
    ? t('dashboard.ago.today')
    : n === 1
      ? t('dashboard.ago.yesterday')
      : t('dashboard.ago.daysAgo', { n });
