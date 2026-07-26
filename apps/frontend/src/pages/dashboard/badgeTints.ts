import type { CSSProperties } from 'react';

/** Soft brand tint for provider badges (border / fill / text). */
const PROVIDER_BRAND: Record<string, string> = {
  yandex: '#4C8BF5',
  timeweb: '#8B5CF6',
  hetzner: '#EF4444',
  doubleservers: '#A78BFA',
  selectel: '#22C55E',
  beget: '#F97316',
  vultr: '#007BFC',
  linode: '#02B159',
  cloudflare: '#F6821F',
  aeza: '#8B5CF6',
  vdsina: '#0EA5E9',
  netcup: '#F59E0B',
  netlen: '#E11D48',
  '4vps': '#14B8A6',
  porkbun: '#EC4899',
  stormwall: '#64748B',
  hostbill: '#6366F1',
  billmgr: '#6366F1',
  manual: '#94A3B8',
};

/** Soft country tint for service badges (complements the flag). */
const COUNTRY_TINT: Record<string, string> = {
  RU: '#3B82F6',
  DE: '#F59E0B',
  FI: '#0EA5E9',
  NL: '#F97316',
  PL: '#EF4444',
  KZ: '#22C55E',
  US: '#6366F1',
  SG: '#C44B5C',
  GB: '#A855F7',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function tintStyle(hex: string): CSSProperties {
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  const { r, g, b } = rgb;
  return {
    borderColor: `rgba(${r}, ${g}, ${b}, 0.45)`,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.14)`,
    color: hex,
  };
}

export function providerBadgeStyle(kind: string | null | undefined): CSSProperties {
  return tintStyle(PROVIDER_BRAND[kind ?? ''] ?? PROVIDER_BRAND.manual);
}

export function countryBadgeStyle(countryCode: string | null | undefined): CSSProperties {
  const code = (countryCode ?? '').toUpperCase();
  if (!code || code === 'XX') return tintStyle(PROVIDER_BRAND.manual);
  return tintStyle(COUNTRY_TINT[code] ?? PROVIDER_BRAND.manual);
}
