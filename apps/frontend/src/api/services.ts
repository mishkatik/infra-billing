import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateService, Service, UpdateService } from '@infra/shared';
import { api } from './client';
import { API_PATH, serviceTypeSchema, uuidSchema } from '@infra/shared';

export interface ServiceFilter {
  providerUuid?: string;
  projectUuid?: string;
  type?: string;
  isActive?: boolean;
}

/**
 * Validate a filter read back from localStorage with the same schemas the API enforces, so a
 * restored value can never 400; malformed or unknown fields are dropped one by one.
 */
export function parseServiceFilter(raw: unknown): ServiceFilter | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const f: ServiceFilter = {};
  const provider = uuidSchema.safeParse(o.providerUuid);
  if (provider.success) f.providerUuid = provider.data;
  const project = uuidSchema.safeParse(o.projectUuid);
  if (project.success) f.projectUuid = project.data;
  const type = serviceTypeSchema.safeParse(o.type);
  if (type.success) f.type = type.data;
  if (typeof o.isActive === 'boolean') f.isActive = o.isActive;
  return f;
}

export function useServices(filter: ServiceFilter = {}) {
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
