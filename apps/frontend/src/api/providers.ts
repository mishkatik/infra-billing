import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateProvider,
  CreateProviderAccount,
  NetcupDevicePollResult,
  NetcupDeviceStart,
  Provider,
  ProviderAccount,
  ProviderCredentialsReveal,
  SyncRun,
  UpdateProvider,
  UpdateProviderAccount,
  YandexDiscover,
  YandexDiscoverResult,
} from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

const KEY = ['providers'];
// Mutation keys let always-mounted widgets (sidebar sync group, command palette) see a sync that a
// page started. SYNC_KEY mutations carry the account uuid as their variables.
export const SYNC_KEY = ['provider-sync'];
export const SYNC_ALL_KEY = ['provider-sync-all'];

// Provider edits and syncs move balances, services and payments, so the dashboard summary (and the
// sidebar meter fed by it) must refetch too.
const ANALYTICS = ['analytics'];

export type SecretField = keyof ProviderCredentialsReveal;

/** Plaintext secrets of one account, on explicit request (the edit form's eye button). */
export async function revealAccountCredentials(
  accountUuid: string,
): Promise<ProviderCredentialsReveal> {
  return (
    await api.get<ProviderCredentialsReveal>(
      API_PATH.PROVIDER_ACCOUNTS.CREDENTIALS_REVEAL(accountUuid),
    )
  ).data;
}

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ANALYTICS });
    },
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateProvider }) =>
      (await api.patch<Provider>(API_PATH.PROVIDERS.BY_ID(uuid), dto)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ANALYTICS });
    },
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(API_PATH.PROVIDERS.BY_ID(uuid));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ANALYTICS });
    },
  });
}

/** Fold a duplicate provider into another of the same kind; its accounts move over intact. */
export function useMergeProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      uuid,
      targetProviderUuid,
    }: {
      uuid: string;
      targetProviderUuid: string;
    }) => (await api.post<Provider>(API_PATH.PROVIDERS.MERGE(uuid), { targetProviderUuid })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ANALYTICS });
    },
  });
}

export function useCreateProviderAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      providerUuid,
      dto,
    }: {
      providerUuid: string;
      dto: CreateProviderAccount;
    }) => (await api.post<ProviderAccount>(API_PATH.PROVIDERS.ACCOUNTS(providerUuid), dto)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ANALYTICS });
    },
  });
}

export function useUpdateProviderAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateProviderAccount }) =>
      (await api.patch<ProviderAccount>(API_PATH.PROVIDER_ACCOUNTS.BY_ID(uuid), dto)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ANALYTICS });
    },
  });
}

/** Deletes an account with its services and payments (the backend refuses the last one). */
export function useDeleteProviderAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(API_PATH.PROVIDER_ACCOUNTS.BY_ID(uuid));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ANALYTICS });
    },
  });
}

/** Sync one account; the mutation variables are the account uuid (see useSyncActivity). */
export function useSyncAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SYNC_KEY,
    mutationFn: async (accountUuid: string) =>
      (await api.post<SyncRun>(API_PATH.PROVIDER_ACCOUNTS.SYNC(accountUuid))).data,
    // onSettled, not onSuccess: a failed run is still recorded (lastSyncError, sync-runs).
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['sync-runs'] });
      qc.invalidateQueries({ queryKey: ANALYTICS });
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
    mutationKey: SYNC_ALL_KEY,
    mutationFn: async () => (await api.post<SyncAllResult>(API_PATH.PROVIDERS.SYNC_ALL)).data,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['sync-runs'] });
      qc.invalidateQueries({ queryKey: ANALYTICS });
    },
  });
}

/**
 * Syncs in flight anywhere in the app: account uuids plus a flag for a running "sync all"
 * (which covers every enabled account of an API provider).
 */
export function useSyncActivity() {
  const syncing = useMutationState({
    filters: { mutationKey: SYNC_KEY, status: 'pending' },
    select: (m) => m.state.variables as string,
  });
  const all = useIsMutating({ mutationKey: SYNC_ALL_KEY }) > 0;
  return { syncing: new Set(syncing), all };
}

/** Recent sync runs of one account, newest first (the backend caps the list at 50). */
export const syncRunsQuery = (accountUuid: string) => ({
  queryKey: ['sync-runs', accountUuid],
  queryFn: async () =>
    (await api.get<SyncRun[]>(API_PATH.PROVIDER_ACCOUNTS.SYNC_RUNS(accountUuid))).data,
});

export function useSyncRuns(accountUuid: string | null | undefined) {
  return useQuery({ ...syncRunsQuery(accountUuid ?? ''), enabled: Boolean(accountUuid) });
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
 * Resolve the Yandex scope (folders + billing account) from a pasted key or an existing account.
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
