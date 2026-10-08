import type { Provider } from '@infra/shared';
import type { SortValue } from '@/hooks/useTableSort';
import { toBaseAmount } from '@/utils/money';

export const PROVIDER_SORT_KEYS = ['name', 'balance', 'services', 'payments'] as const;
export type ProviderSortKey = (typeof PROVIDER_SORT_KEYS)[number];

interface ProviderSortContext {
  /** RUB per unit of each currency (buildRubMap). */
  rub: Map<string, number>;
  /** Base currency from settings. */
  base: string;
}

/**
 * A provider's balances (one per currency) summed in the base currency. Null without a balance or
 * when a rate is missing, so such providers go last instead of sorting by a mixed-currency sum.
 */
function baseBalance(p: Provider, ctx: ProviderSortContext): number | null {
  if (p.balances.length === 0) return null;
  let sum = 0;
  for (const b of p.balances) {
    const v = toBaseAmount(b.amount, b.currency, ctx.base, ctx.rub);
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

export function providerSortAccessors(
  ctx: ProviderSortContext,
): Record<ProviderSortKey, (p: Provider) => SortValue> {
  return {
    name: (p) => p.name,
    balance: (p) => baseBalance(p, ctx),
    services: (p) => p.servicesCount,
    payments: (p) => p.paymentsCount,
  };
}
