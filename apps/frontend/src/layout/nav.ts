import {
  type Icon,
  IconFolders,
  IconKey,
  IconLayoutDashboard,
  IconReceipt2,
  IconServer2,
  IconSettings,
  IconShieldLock,
  IconStack2,
} from '@tabler/icons-react';

// Single source for the sidebar nav and the command palette's page list.
export interface NavItem {
  to: string;
  labelKey: string;
  icon: Icon;
  end?: boolean;
}

export const NAV: { sectionKey: string; items: NavItem[] }[] = [
  {
    sectionKey: 'nav.overview',
    items: [{ to: '/', labelKey: 'nav.dashboard', icon: IconLayoutDashboard, end: true }],
  },
  {
    sectionKey: 'nav.infrastructure',
    items: [
      { to: '/providers', labelKey: 'nav.providers', icon: IconServer2 },
      { to: '/projects', labelKey: 'nav.projects', icon: IconFolders },
      { to: '/services', labelKey: 'nav.services', icon: IconStack2 },
      { to: '/payments', labelKey: 'nav.payments', icon: IconReceipt2 },
    ],
  },
  {
    sectionKey: 'nav.settings',
    items: [
      { to: '/settings', labelKey: 'nav.settingsItem', icon: IconSettings, end: true },
      { to: '/settings/auth', labelKey: 'nav.authItem', icon: IconShieldLock },
      { to: '/settings/tokens', labelKey: 'nav.tokensItem', icon: IconKey },
    ],
  },
];

export const isNavActive = (item: NavItem, pathname: string) =>
  item.end ? pathname === item.to : pathname.startsWith(item.to);
