import {
  IconFolders,
  IconKey,
  IconLayoutDashboard,
  IconReceipt2,
  IconServer2,
  IconSettings,
  IconShieldLock,
  IconStack2,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import type { Me, Permission } from '@infra/shared';
import { can, isAdmin } from './permissions';

export type AppPageSection = 'nav.overview' | 'nav.infrastructure' | 'nav.settings';

export interface AppPage {
  /** Router path relative to the app layout; '' marks the index route (dashboard), rendered via HomeRoute. */
  path: string;
  labelKey: string;
  icon: Icon;
  section: AppPageSection;
  perm?: Permission;
  adminOnly?: boolean;
  end?: boolean;
}

/**
 * Single source of truth for the permission -> page binding.
 * Nav rendering, route gating, and the home redirect all read from this list
 * instead of each encoding the same perm/adminOnly rules independently.
 */
export const APP_PAGES: AppPage[] = [
  {
    path: '',
    labelKey: 'nav.dashboard',
    icon: IconLayoutDashboard,
    section: 'nav.overview',
    perm: 'dashboard:read',
    end: true,
  },
  {
    path: 'providers',
    labelKey: 'nav.providers',
    icon: IconServer2,
    section: 'nav.infrastructure',
    perm: 'providers:read',
  },
  {
    path: 'projects',
    labelKey: 'nav.projects',
    icon: IconFolders,
    section: 'nav.infrastructure',
    adminOnly: true,
  },
  {
    path: 'services',
    labelKey: 'nav.services',
    icon: IconStack2,
    section: 'nav.infrastructure',
    perm: 'services:read',
  },
  {
    path: 'payments',
    labelKey: 'nav.payments',
    icon: IconReceipt2,
    section: 'nav.infrastructure',
    perm: 'payments:read',
  },
  {
    path: 'settings',
    labelKey: 'nav.settingsItem',
    icon: IconSettings,
    section: 'nav.settings',
    adminOnly: true,
    end: true,
  },
  {
    path: 'settings/auth',
    labelKey: 'nav.authItem',
    icon: IconShieldLock,
    section: 'nav.settings',
  },
  {
    path: 'settings/tokens',
    labelKey: 'nav.tokensItem',
    icon: IconKey,
    section: 'nav.settings',
    adminOnly: true,
  },
  {
    path: 'settings/accounts',
    labelKey: 'nav.accountsItem',
    icon: IconUsers,
    section: 'nav.settings',
    adminOnly: true,
  },
];

export function pageAllowed(me: Me | undefined, page: AppPage): boolean {
  if (page.adminOnly) return isAdmin(me);
  if (page.perm) return can(me, page.perm);
  return true;
}
