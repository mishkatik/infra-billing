import type { Me, Permission } from '@infra/shared';
import type { LoginResult } from './auth.service';

export interface AdminPrincipal {
  kind: 'admin';
  username: string;
}

export interface MemberPrincipal {
  kind: 'member';
  accountUuid: string;
  username: string;
  permissions: ReadonlySet<Permission>;
  projectUuids: readonly string[];
}

export type Principal = AdminPrincipal | MemberPrincipal;

const READ_OF: Partial<Record<Permission, Permission>> = {
  'services:edit': 'services:read',
  'providers:edit': 'providers:read',
  'payments:edit': 'payments:read',
};

/** Edit implies read; result is deduped. */
export function normalizePermissions(perms: readonly Permission[]): Permission[] {
  const set = new Set<Permission>(perms);
  for (const p of perms) {
    const read = READ_OF[p];
    if (read) set.add(read);
  }
  return [...set];
}

export function hasPerm(principal: Principal, perm: Permission): boolean {
  return principal.kind === 'admin' || principal.permissions.has(perm);
}

/**
 * Intersect a requested project filter with the caller's scope.
 * Admin: the request as-is (undefined = unrestricted). Member: always an explicit
 * array — their scope when nothing was requested, the intersection otherwise.
 */
export function clampProjects(
  principal: Principal,
  requested: string[] | undefined,
): string[] | undefined {
  if (principal.kind === 'admin') return requested?.length ? requested : undefined;
  if (!requested?.length) return [...principal.projectUuids];
  return requested.filter((uuid) => principal.projectUuids.includes(uuid));
}

// Shape shared by every account row we build a member principal from (login lookup, session
// re-read, invite claim) — structural, so it accepts any Prisma Account payload that includes
// `projects`. `username` is nullable in the row type because pending (unclaimed) accounts have
// none, but a principal is only ever built once a session exists — which requires a password
// match (login) or a just-completed claim — both of which guarantee a username is set.
interface AccountForPrincipal {
  uuid: string;
  username: string | null;
  permissions: string[];
  projects: { projectUuid: string }[];
}

/** The one account-row → principal mapping, shared by login, session re-read and invite claim. */
export function memberPrincipalFromAccount(account: AccountForPrincipal): MemberPrincipal {
  if (account.username == null) {
    // Invariant violation, not a normal auth failure: a pending account (no password set) can
    // never pass verifyLogin, and claimInvite sets the username before this is ever called.
    throw new Error('memberPrincipalFromAccount: pending account has no username');
  }
  return {
    kind: 'member',
    accountUuid: account.uuid,
    username: account.username,
    permissions: new Set(normalizePermissions(account.permissions as Permission[])),
    projectUuids: account.projects.map((p) => p.projectUuid),
  };
}

/** Login-result → principal, for the just-authenticated response (before a session even exists). */
export function loginResultToPrincipal(result: LoginResult): Principal {
  if (!result.account) return { kind: 'admin', username: result.username };
  return memberPrincipalFromAccount(result.account);
}

export function toMe(principal: Principal): Me {
  if (principal.kind === 'member') {
    return {
      username: principal.username,
      role: 'member',
      permissions: [...principal.permissions],
      projectUuids: [...principal.projectUuids],
    };
  }
  return { username: principal.username, role: 'admin', permissions: [], projectUuids: null };
}
