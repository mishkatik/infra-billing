import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AnalyticsSummary, BalancePoint, ForecastPoint } from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

export function useSummary(projects: string[] = []) {
  const key = [...projects].sort().join(',');
  return useQuery({
    queryKey: ['analytics', 'summary', key],
    queryFn: async () =>
      (
        await api.get<AnalyticsSummary>(API_PATH.ANALYTICS.SUMMARY, {
          params: key ? { projects: key } : {},
        })
      ).data,
    placeholderData: keepPreviousData,
  });
}

export function useForecast(months = 12, monthsBack = 3, projects: string[] = []) {
  const key = [...projects].sort().join(',');
  return useQuery({
    queryKey: ['analytics', 'forecast', months, monthsBack, key],
    queryFn: async () =>
      (
        await api.get<ForecastPoint[]>(API_PATH.ANALYTICS.FORECAST, {
          params: { months, monthsBack, ...(key ? { projects: key } : {}) },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
}

export function useBalanceHistory(uuid?: string) {
  return useQuery({
    queryKey: ['balance-history', uuid],
    enabled: Boolean(uuid),
    queryFn: async () =>
      (await api.get<BalancePoint[]>(API_PATH.PROVIDERS.BALANCE_HISTORY(uuid!))).data,
  });
}
