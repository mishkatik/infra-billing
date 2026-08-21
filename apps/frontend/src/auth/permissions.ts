import type { Me, Permission } from '@infra/shared';

export function isAdmin(me: Me | undefined): boolean {
  return me?.role === 'admin';
}

export function can(me: Me | undefined, perm: Permission): boolean {
  if (!me) return false;
  return me.role === 'admin' || me.permissions.includes(perm);
}
