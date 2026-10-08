import { queryOptions, useQuery } from '@tanstack/react-query';
import type { AccountSpend, AnalyticsSummary, BalancePoint, ForecastPoint } from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

export function useSummary() {
  return useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: async () => (await api.get<AnalyticsSummary>(API_PATH.ANALYTICS.SUMMARY)).data,
  });
}

export function useForecast(months = 12, monthsBack = 3) {
  return useQuery({
    queryKey: ['analytics', 'forecast', months, monthsBack],
    queryFn: async () =>
      (
        await api.get<ForecastPoint[]>(API_PATH.ANALYTICS.FORECAST, {
          params: { months, monthsBack },
        })
      ).data,
  });
}

/** Balance snapshots of one provider account, oldest first. */
export function useBalanceHistory(accountUuid?: string) {
  return useQuery({
    queryKey: ['balance-history', accountUuid],
    enabled: Boolean(accountUuid),
    queryFn: async () =>
      (await api.get<BalancePoint[]>(API_PATH.PROVIDER_ACCOUNTS.BALANCE_HISTORY(accountUuid!)))
        .data,
  });
}

/**
 * Last 30 days of an account's spend. Under the `analytics` key, so syncs and payment changes
 * refresh it; shared by the account cards and the provider's Details total.
 */
export function accountSpendQuery(accountUuid: string) {
  return queryOptions({
    queryKey: ['analytics', 'account-spend', accountUuid],
    queryFn: async () =>
      (await api.get<AccountSpend>(API_PATH.PROVIDER_ACCOUNTS.SPEND(accountUuid))).data,
  });
}

export function useAccountSpend(accountUuid: string) {
  return useQuery(accountSpendQuery(accountUuid));
}
