import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Permission } from '@infra/shared';
import { useMe } from '@/api/auth';
import { can, isAdmin } from './permissions';

interface RequirePermRouteProps {
  perm?: Permission;
  adminOnly?: boolean;
  children: ReactNode;
}

/** Route-level permission gate; unauthorized principals bounce to the index redirect. */
export function RequirePermRoute({ perm, adminOnly, children }: RequirePermRouteProps) {
  const me = useMe();
  if (me.isLoading) return null;
  const ok = adminOnly ? isAdmin(me.data) : perm ? can(me.data, perm) : true;
  if (!ok) return <Navigate to="/" replace />;
  return <>{children}</>;
}
