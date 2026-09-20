import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePayment, PaginatedPayments, Payment } from '@infra/shared';
import { api } from './client';
import { API_PATH, isoDateSchema, uuidSchema } from '@infra/shared';

export interface PaymentFilter {
  providerUuid?: string;
  serviceUuid?: string;
  from?: string;
  to?: string;
}

/**
 * Validate a filter read back from localStorage with the same schemas the API enforces; malformed
 * fields are dropped. serviceUuid is never restored — the filter bar doesn't set it.
 */
export function parsePaymentFilter(raw: unknown): PaymentFilter | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const f: PaymentFilter = {};
  const provider = uuidSchema.safeParse(o.providerUuid);
  if (provider.success) f.providerUuid = provider.data;
  const from = isoDateSchema.safeParse(o.from);
  if (from.success) f.from = from.data;
  const to = isoDateSchema.safeParse(o.to);
  if (to.success) f.to = to.data;
  return f;
}

interface UsePaymentsOpts {
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}

export function usePayments(filter: PaymentFilter = {}, opts: UsePaymentsOpts = {}) {
  const { page = 1, pageSize = 50, enabled = true } = opts;
  return useQuery({
    enabled,
    queryKey: ['payments', filter, page, pageSize],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
      if (filter.providerUuid) params.providerUuid = filter.providerUuid;
      if (filter.serviceUuid) params.serviceUuid = filter.serviceUuid;
      if (filter.from) params.from = filter.from;
      if (filter.to) params.to = filter.to;
      return (await api.get<PaginatedPayments>(API_PATH.PAYMENTS.ROOT, { params })).data;
    },
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreatePayment) =>
      (await api.post<Payment>(API_PATH.PAYMENTS.ROOT, dto)).data,
    // ['services'] too: paymentsCount on the services list depends on payments.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(API_PATH.PAYMENTS.BY_ID(uuid));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}
