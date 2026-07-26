import type { Icon } from '@tabler/icons-react';
import {
  IconBox,
  IconBrandDocker,
  IconBrandTelegram,
  IconBuilding,
  IconBuildingSkyscraper,
  IconCloud,
  IconCloudComputing,
  IconCloudDataConnection,
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconDevicesPc,
  IconFolder,
  IconGlobe,
  IconKey,
  IconLock,
  IconNetwork,
  IconPackage,
  IconRocket,
  IconRouter,
  IconServer,
  IconServer2,
  IconShield,
  IconStack2,
  IconTerminal2,
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

export const TABLER_ICON_CATALOG: { name: string; Icon: Icon; keywords: string[] }[] = [
  { name: 'IconServer', Icon: IconServer, keywords: ['server', 'vps', 'host'] },
  { name: 'IconServer2', Icon: IconServer2, keywords: ['server', 'rack'] },
  { name: 'IconCloud', Icon: IconCloud, keywords: ['cloud'] },
  { name: 'IconCloudComputing', Icon: IconCloudComputing, keywords: ['cloud', 'compute'] },
  {
    name: 'IconCloudDataConnection',
    Icon: IconCloudDataConnection,
    keywords: ['cloud', 'network'],
  },
  { name: 'IconDatabase', Icon: IconDatabase, keywords: ['database', 'sql', 'db'] },
  { name: 'IconCpu', Icon: IconCpu, keywords: ['cpu', 'processor'] },
  { name: 'IconTerminal2', Icon: IconTerminal2, keywords: ['terminal', 'shell', 'cli'] },
  { name: 'IconNetwork', Icon: IconNetwork, keywords: ['network', 'lan'] },
  { name: 'IconRouter', Icon: IconRouter, keywords: ['router', 'gateway'] },
  { name: 'IconGlobe', Icon: IconGlobe, keywords: ['globe', 'world', 'dns'] },
  { name: 'IconWorld', Icon: IconWorld, keywords: ['world', 'global'] },
  { name: 'IconWorldWww', Icon: IconWorldWww, keywords: ['www', 'web', 'site'] },
  { name: 'IconShield', Icon: IconShield, keywords: ['shield', 'security', 'firewall'] },
  { name: 'IconLock', Icon: IconLock, keywords: ['lock', 'secure'] },
  { name: 'IconKey', Icon: IconKey, keywords: ['key', 'token', 'secret'] },
  { name: 'IconBox', Icon: IconBox, keywords: ['box', 'package'] },
  { name: 'IconPackage', Icon: IconPackage, keywords: ['package', 'parcel'] },
  { name: 'IconStack2', Icon: IconStack2, keywords: ['stack', 'layers'] },
  { name: 'IconBrandDocker', Icon: IconBrandDocker, keywords: ['docker', 'container'] },
  { name: 'IconDeviceDesktop', Icon: IconDeviceDesktop, keywords: ['desktop', 'pc'] },
  { name: 'IconDevicesPc', Icon: IconDevicesPc, keywords: ['pc', 'computer'] },
  { name: 'IconFolder', Icon: IconFolder, keywords: ['folder', 'project'] },
  { name: 'IconBuilding', Icon: IconBuilding, keywords: ['building', 'office'] },
  {
    name: 'IconBuildingSkyscraper',
    Icon: IconBuildingSkyscraper,
    keywords: ['skyscraper', 'company'],
  },
  { name: 'IconRocket', Icon: IconRocket, keywords: ['rocket', 'deploy'] },
  { name: 'IconBrandTelegram', Icon: IconBrandTelegram, keywords: ['telegram', 'bot'] },
];

const byName = new Map(TABLER_ICON_CATALOG.map((e) => [e.name, e.Icon]));

export function resolveTablerIcon(name: string | null | undefined): Icon | null {
  if (!name) return null;
  return byName.get(name) ?? null;
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
