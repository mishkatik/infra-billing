import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProvider,
  NetcupDevicePollResult,
  NetcupDeviceStart,
  Provider,
  SyncRun,
  UpdateProvider,
  YandexDiscover,
  YandexDiscoverResult,
} from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

const KEY = ['providers'];

export function useProviders() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Provider[]>(API_PATH.PROVIDERS.ROOT)).data,
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateProvider) =>
      (await api.post<Provider>(API_PATH.PROVIDERS.ROOT, dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateProvider }) =>
      (await api.patch<Provider>(API_PATH.PROVIDERS.BY_ID(uuid), dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(API_PATH.PROVIDERS.BY_ID(uuid));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSyncProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) =>
      (await api.post<SyncRun>(API_PATH.PROVIDERS.SYNC(uuid))).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export interface SyncAllResult {
  total: number;
  ok: number;
  failed: number;
}

export function useSyncAllProviders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<SyncAllResult>(API_PATH.PROVIDERS.SYNC_ALL)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

/** Start the netcup OAuth2 device flow (returns the user code + verification URL). */
export function useNetcupDeviceStart() {
  return useMutation({
    mutationFn: async () =>
      (await api.post<NetcupDeviceStart>(API_PATH.PROVIDERS.NETCUP_DEVICE_START)).data,
  });
}

/** Poll once for the netcup device-flow result (pending / authorized + refreshToken / …). */
export function useNetcupDevicePoll() {
  return useMutation({
    mutationFn: async (deviceCode: string) =>
      (
        await api.post<NetcupDevicePollResult>(API_PATH.PROVIDERS.NETCUP_DEVICE_POLL, {
          deviceCode,
        })
      ).data,
  });
}

/**
 * Resolve the Yandex scope (folders + billing account) from a pasted key or an existing provider.
 * A query (not a mutation) so the 200 result survives StrictMode's double mount and is cached per
 * input - a mutate-scoped callback would be dropped on the throwaway first mount, leaving the form
 * stuck on "Resolving". Pass `null` to stay idle (wrong kind / incomplete key).
 */
export function useYandexDiscover(body: YandexDiscover | null) {
  return useQuery({
    queryKey: ['yandex-discover', body],
    enabled: body != null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () =>
      (await api.post<YandexDiscoverResult>(API_PATH.PROVIDERS.YANDEX_DISCOVER, body)).data,
  });
}
