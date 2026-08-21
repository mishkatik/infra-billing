import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  Account,
  ClaimInviteInput,
  CreateAccountInput,
  CreatedInvite,
  CreateInviteInput,
  InviteInfo,
  Me,
  ResetLink,
  UpdateAccountInput,
} from '@infra/shared';
import { API_PATH } from '@infra/shared';
import { api } from './client';

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get<Account[]>(API_PATH.ACCOUNTS.ROOT)).data,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAccountInput) =>
      (await api.post<Account>(API_PATH.ACCOUNTS.ROOT, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, ...input }: UpdateAccountInput & { uuid: string }) =>
      (await api.patch<Account>(API_PATH.ACCOUNTS.BY_ID(uuid), input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(API_PATH.ACCOUNTS.BY_ID(uuid));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

/** Create a pending account: username/password left to the invitee. Token is returned once. */
export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInviteInput) =>
      (await api.post<CreatedInvite>(API_PATH.ACCOUNTS.INVITES, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

/** Re-issue an invite/reset link on any account (resets its password for an already-claimed one). */
export function useIssueInviteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) =>
      (await api.post<ResetLink>(API_PATH.ACCOUNTS.INVITE_LINK(uuid))).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

// --- Public claim page (no session yet) ---

export function useInviteInfo(token: string) {
  return useQuery({
    queryKey: ['inviteInfo', token],
    queryFn: async () => (await api.get<InviteInfo>(API_PATH.ACCOUNTS.INVITE_BY_TOKEN(token))).data,
    retry: false,
  });
}

export function useClaimInvite(token: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (input: ClaimInviteInput) =>
      (await api.post<Me>(API_PATH.ACCOUNTS.INVITE_BY_TOKEN(token), input)).data,
    onSuccess: (me) => {
      qc.setQueryData(['me'], me);
      navigate('/', { replace: true });
    },
  });
}
