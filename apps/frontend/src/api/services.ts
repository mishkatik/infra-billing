import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateService, Service, UpdateService } from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

export interface ServiceFilter {
  providerUuid?: string;
  projectUuid?: string;
  type?: string;
  isActive?: boolean;
}

export function useServices(filter: ServiceFilter = {}, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['services', filter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filter.providerUuid) params.providerUuid = filter.providerUuid;
      if (filter.projectUuid) params.projectUuid = filter.projectUuid;
      if (filter.type) params.type = filter.type;
      if (filter.isActive !== undefined) params.isActive = String(filter.isActive);
      return (await api.get<Service[]>(API_PATH.SERVICES.ROOT, { params })).data;
    },
    enabled: opts?.enabled ?? true,
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateService) =>
      (await api.post<Service>(API_PATH.SERVICES.ROOT, dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateService }) =>
      (await api.patch<Service>(API_PATH.SERVICES.BY_ID(uuid), dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(API_PATH.SERVICES.BY_ID(uuid));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}
