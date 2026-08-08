import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Settings, UpdateSettings } from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<Settings>(API_PATH.SETTINGS)).data,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateSettings) =>
      (await api.patch<Settings>(API_PATH.SETTINGS, dto)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      // Forecast series depends on tariff-backfill flags.
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

/** Send a sample of every notification type (preview formats + verify token/chat). `sent` = count. */
export function useTestTelegram() {
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ enabled: boolean; sent: number }>(API_PATH.NOTIFICATIONS.TEST)).data,
  });
}
