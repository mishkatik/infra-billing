import type { Icon } from '@tabler/icons-react';
import {
  IconAccessPoint,
  IconActivity,
  IconAntenna,
  IconApi,
  IconAppWindow,
  IconArchive,
  IconBell,
  IconBolt,
  IconBox,
  IconBrandAws,
  IconBrandCloudflare,
  IconBrandDocker,
  IconBrandGithub,
  IconBrandTelegram,
  IconBrowser,
  IconBug,
  IconBuilding,
  IconBuildingBank,
  IconBuildingSkyscraper,
  IconBuildingStore,
  IconCalendar,
  IconChartBar,
  IconCloud,
  IconCloudComputing,
  IconCloudDataConnection,
  IconCode,
  IconContainer,
  IconCpu,
  IconCreditCard,
  IconCube,
  IconDatabase,
  IconDeviceDesktop,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDevicesPc,
  IconFingerprint,
  IconFolder,
  IconGauge,
  IconHome,
  IconGitBranch,
  IconGlobe,
  IconKey,
  IconLayoutDashboard,
  IconLink,
  IconLock,
  IconMail,
  IconNetwork,
  IconPackage,
  IconPlug,
  IconRadar,
  IconReceipt,
  IconRefresh,
  IconRobot,
  IconRocket,
  IconRouter,
  IconSearch,
  IconServer,
  IconServer2,
  IconSettings,
  IconShield,
  IconShoppingCart,
  IconSitemap,
  IconStack2,
  IconTerminal2,
  IconUsers,
  IconWallet,
  IconWebhook,
  IconWifi,
  IconWorld,
  IconWorldWww,
} from '@tabler/icons-react';

export const DEFAULT_ICON_BG = '#64748B';

export const ICON_BG_SWATCHES = [
  '#64748B',
  '#334155',
  '#0F766E',
  '#0891B2',
  '#2563EB',
  '#4F46E5',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#DB2777',
  '#78716C',
] as const;

export type TablerIconEntry = {
  name: string;
  label: string;
  Icon: Icon;
  keywords: string[];
};

export const TABLER_ICON_CATALOG: TablerIconEntry[] = [
  { name: 'IconServer', label: 'Server', Icon: IconServer, keywords: ['server', 'vps', 'host'] },
  { name: 'IconServer2', label: 'Rack', Icon: IconServer2, keywords: ['server', 'rack'] },
  { name: 'IconCloud', label: 'Cloud', Icon: IconCloud, keywords: ['cloud'] },
  {
    name: 'IconCloudComputing',
    label: 'Compute',
    Icon: IconCloudComputing,
    keywords: ['cloud', 'compute'],
  },
  {
    name: 'IconCloudDataConnection',
    label: 'Bridge',
    Icon: IconCloudDataConnection,
    keywords: ['cloud', 'network', 'bridge'],
  },
  { name: 'IconDatabase', label: 'Database', Icon: IconDatabase, keywords: ['database', 'sql', 'db'] },
  { name: 'IconCpu', label: 'Cpu', Icon: IconCpu, keywords: ['cpu', 'processor'] },
  {
    name: 'IconTerminal2',
    label: 'Terminal',
    Icon: IconTerminal2,
    keywords: ['terminal', 'shell', 'cli'],
  },
  { name: 'IconNetwork', label: 'Network', Icon: IconNetwork, keywords: ['network', 'lan'] },
  { name: 'IconRouter', label: 'Router', Icon: IconRouter, keywords: ['router', 'gateway'] },
  { name: 'IconWifi', label: 'Wifi', Icon: IconWifi, keywords: ['wifi', 'wireless'] },
  { name: 'IconAntenna', label: 'Antenna', Icon: IconAntenna, keywords: ['antenna', 'radio'] },
  {
    name: 'IconAccessPoint',
    label: 'Hotspot',
    Icon: IconAccessPoint,
    keywords: ['access', 'hotspot', 'ap'],
  },
  { name: 'IconGlobe', label: 'Globe', Icon: IconGlobe, keywords: ['globe', 'world', 'dns'] },
  { name: 'IconWorld', label: 'World', Icon: IconWorld, keywords: ['world', 'global'] },
  { name: 'IconWorldWww', label: 'Site', Icon: IconWorldWww, keywords: ['www', 'web', 'site'] },
  { name: 'IconShield', label: 'Shield', Icon: IconShield, keywords: ['shield', 'security', 'firewall'] },
  { name: 'IconLock', label: 'Lock', Icon: IconLock, keywords: ['lock', 'secure'] },
  { name: 'IconKey', label: 'Key', Icon: IconKey, keywords: ['key', 'token', 'secret'] },
  {
    name: 'IconFingerprint',
    label: 'Fingerprint',
    Icon: IconFingerprint,
    keywords: ['fingerprint', 'auth', 'biometric'],
  },
  { name: 'IconBox', label: 'Box', Icon: IconBox, keywords: ['box', 'package'] },
  { name: 'IconPackage', label: 'Package', Icon: IconPackage, keywords: ['package', 'parcel'] },
  { name: 'IconStack2', label: 'Stack', Icon: IconStack2, keywords: ['stack', 'layers'] },
  { name: 'IconCube', label: 'Cube', Icon: IconCube, keywords: ['cube', '3d'] },
  {
    name: 'IconContainer',
    label: 'Container',
    Icon: IconContainer,
    keywords: ['container', 'docker'],
  },
  {
    name: 'IconBrandDocker',
    label: 'Docker',
    Icon: IconBrandDocker,
    keywords: ['docker', 'container'],
  },
  {
    name: 'IconDeviceDesktop',
    label: 'Desktop',
    Icon: IconDeviceDesktop,
    keywords: ['desktop', 'pc'],
  },
  {
    name: 'IconDevicesPc',
    label: 'Computer',
    Icon: IconDevicesPc,
    keywords: ['pc', 'computer'],
  },
  {
    name: 'IconDeviceLaptop',
    label: 'Laptop',
    Icon: IconDeviceLaptop,
    keywords: ['laptop', 'notebook'],
  },
  {
    name: 'IconDeviceMobile',
    label: 'Mobile',
    Icon: IconDeviceMobile,
    keywords: ['mobile', 'phone'],
  },
  { name: 'IconAppWindow', label: 'Window', Icon: IconAppWindow, keywords: ['window', 'app', 'ui'] },
  { name: 'IconBrowser', label: 'Browser', Icon: IconBrowser, keywords: ['browser', 'web'] },
  { name: 'IconFolder', label: 'Folder', Icon: IconFolder, keywords: ['folder', 'project'] },
  { name: 'IconArchive', label: 'Archive', Icon: IconArchive, keywords: ['archive', 'zip'] },
  { name: 'IconHome', label: 'Home', Icon: IconHome, keywords: ['home', 'house'] },
  { name: 'IconBuilding', label: 'Building', Icon: IconBuilding, keywords: ['building', 'office'] },
  {
    name: 'IconBuildingSkyscraper',
    label: 'Tower',
    Icon: IconBuildingSkyscraper,
    keywords: ['skyscraper', 'company', 'tower'],
  },
  {
    name: 'IconBuildingStore',
    label: 'Store',
    Icon: IconBuildingStore,
    keywords: ['store', 'shop'],
  },
  { name: 'IconBuildingBank', label: 'Bank', Icon: IconBuildingBank, keywords: ['bank', 'finance'] },
  { name: 'IconRocket', label: 'Rocket', Icon: IconRocket, keywords: ['rocket', 'deploy'] },
  { name: 'IconBolt', label: 'Bolt', Icon: IconBolt, keywords: ['bolt', 'flash', 'power'] },
  { name: 'IconPlug', label: 'Plug', Icon: IconPlug, keywords: ['plug', 'power', 'connect'] },
  { name: 'IconApi', label: 'Api', Icon: IconApi, keywords: ['api', 'rest'] },
  { name: 'IconWebhook', label: 'Webhook', Icon: IconWebhook, keywords: ['webhook', 'hook'] },
  { name: 'IconCode', label: 'Code', Icon: IconCode, keywords: ['code', 'dev'] },
  { name: 'IconBug', label: 'Bug', Icon: IconBug, keywords: ['bug', 'issue'] },
  { name: 'IconGitBranch', label: 'Branch', Icon: IconGitBranch, keywords: ['git', 'branch'] },
  { name: 'IconSitemap', label: 'Sitemap', Icon: IconSitemap, keywords: ['sitemap', 'map'] },
  { name: 'IconLink', label: 'Link', Icon: IconLink, keywords: ['link', 'url'] },
  { name: 'IconSearch', label: 'Search', Icon: IconSearch, keywords: ['search', 'find'] },
  { name: 'IconSettings', label: 'Settings', Icon: IconSettings, keywords: ['settings', 'config'] },
  {
    name: 'IconLayoutDashboard',
    label: 'Dashboard',
    Icon: IconLayoutDashboard,
    keywords: ['dashboard', 'panel'],
  },
  { name: 'IconGauge', label: 'Gauge', Icon: IconGauge, keywords: ['gauge', 'metrics', 'speed'] },
  { name: 'IconChartBar', label: 'Chart', Icon: IconChartBar, keywords: ['chart', 'bar', 'stats'] },
  { name: 'IconActivity', label: 'Activity', Icon: IconActivity, keywords: ['activity', 'pulse'] },
  { name: 'IconRadar', label: 'Radar', Icon: IconRadar, keywords: ['radar', 'scan', 'monitor'] },
  { name: 'IconBell', label: 'Bell', Icon: IconBell, keywords: ['bell', 'alert', 'notify'] },
  { name: 'IconRefresh', label: 'Refresh', Icon: IconRefresh, keywords: ['refresh', 'reload', 'sync'] },
  { name: 'IconCalendar', label: 'Calendar', Icon: IconCalendar, keywords: ['calendar', 'date'] },
  { name: 'IconUsers', label: 'Users', Icon: IconUsers, keywords: ['users', 'team', 'people'] },
  { name: 'IconMail', label: 'Mail', Icon: IconMail, keywords: ['mail', 'email'] },
  {
    name: 'IconBrandTelegram',
    label: 'Telegram',
    Icon: IconBrandTelegram,
    keywords: ['telegram', 'bot'],
  },
  { name: 'IconBrandGithub', label: 'Github', Icon: IconBrandGithub, keywords: ['github', 'git'] },
  { name: 'IconBrandAws', label: 'Aws', Icon: IconBrandAws, keywords: ['aws', 'amazon'] },
  {
    name: 'IconBrandCloudflare',
    label: 'Cloudflare',
    Icon: IconBrandCloudflare,
    keywords: ['cloudflare', 'cdn'],
  },
  { name: 'IconRobot', label: 'Robot', Icon: IconRobot, keywords: ['robot', 'bot', 'ai'] },
  { name: 'IconWallet', label: 'Wallet', Icon: IconWallet, keywords: ['wallet', 'money'] },
  { name: 'IconCreditCard', label: 'Card', Icon: IconCreditCard, keywords: ['card', 'payment'] },
  { name: 'IconReceipt', label: 'Receipt', Icon: IconReceipt, keywords: ['receipt', 'invoice'] },
  {
    name: 'IconShoppingCart',
    label: 'Cart',
    Icon: IconShoppingCart,
    keywords: ['cart', 'shop', 'buy'],
  },
];

const byName = new Map(TABLER_ICON_CATALOG.map((e) => [e.name, e]));
const byNameLower = new Map(TABLER_ICON_CATALOG.map((e) => [e.name.toLowerCase(), e]));

export function resolveTablerIcon(name: string | null | undefined): Icon | null {
  return resolveTablerIconEntry(name)?.Icon ?? null;
}

/** Canonical catalog entry (tolerates cmdk lowercasing the value). */
export function resolveTablerIconEntry(name: string | null | undefined) {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return byName.get(trimmed) ?? byNameLower.get(trimmed.toLowerCase()) ?? null;
}

export function canonicalTablerIconName(name: string | null | undefined): string | null {
  return resolveTablerIconEntry(name)?.name ?? null;
}

export function iconFgForBg(bg: string): string {
  const hex = bg.startsWith('#') ? bg.slice(1) : bg;
  if (hex.length !== 6) return '#ffffff';
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance < 150 ? '#ffffff' : '#1e293b';
}
