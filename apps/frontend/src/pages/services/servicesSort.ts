import type { Period, Project, Service } from '@infra/shared';
import type { SortValue } from '@/hooks/useTableSort';
import { monthlyAmount, toBaseAmount } from '@/utils/money';

export const SERVICE_SORT_KEYS = [
  'name',
  'provider',
  'project',
  'type',
  'cost',
  'period',
  'nextBilling',
] as const;
export type ServiceSortKey = (typeof SERVICE_SORT_KEYS)[number];

// Language-independent duration order; onetime last (no recurrence).
const PERIOD_RANK: Record<Period, number> = {
  hourly: 0,
  daily: 1,
  monthly: 2,
  quarterly: 3,
  yearly: 4,
  onetime: 5,
};

interface ServiceSortContext {
  /** RUB per unit of each currency (buildRubMap). */
  rub: Map<string, number>;
  /** Base currency from settings. */
  base: string;
  /** What the provider cell shows: "Provider · label" for multi-account providers. */
  accountName: (s: Service) => string | null;
  projectOf: (uuid: string) => Project | undefined;
  /** Translated type label — the cell shows it, so the order must follow it. */
  serviceTypeLabel: (type: string) => string;
}

export function serviceSortAccessors(
  ctx: ServiceSortContext,
): Record<ServiceSortKey, (s: Service) => SortValue> {
  return {
    name: (s) => s.name,
    provider: (s) => ctx.accountName(s),
    project: (s) => ctx.projectOf(s.projectUuid)?.name ?? null,
    type: (s) => ctx.serviceTypeLabel(s.type),
    // Monthly-normalized base-currency cost. Zero means "—"/onetime (no recurring
    // burden) → null, so those rows stay at the end in both directions.
    cost: (s) => {
      const monthly = monthlyAmount(s.cost, s.period);
      return monthly === 0 ? null : toBaseAmount(monthly, s.currency, ctx.base, ctx.rub);
    },
    period: (s) => PERIOD_RANK[s.period],
    nextBilling: (s) => (s.nextBillingAt ? Date.parse(s.nextBillingAt) : null),
  };
}
