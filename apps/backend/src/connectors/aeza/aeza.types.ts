// Aeza API v2 response shapes (https://my.aeza.net/api/v2). Only consumed fields are typed.
// Money is in minor currency units (cents/kopecks) → divide by 100. Lists wrap as { items, total }.

// Panel origins of the two independent Aeza branches. They run the same build behind separate
// accounts and billing — the OpenAPI specs at /api/v2/docs-json are byte-identical (verified
// 2026-07), so one connector serves both. Unlike VDSina the branch does not fix the currency:
// /accounts/me reports it per account.
export const AEZA_BASE_URLS = ['https://my.aeza.net', 'https://my.aeza.ru'] as const;
export const AEZA_DEFAULT_BASE_URL = AEZA_BASE_URLS[0];
/** Both branches serve the API under this path (OpenAPI `servers: [{ url: '/api/v2' }]`). */
export const AEZA_API_PATH = '/api/v2';

export interface AezaCredentials {
  token: string;
  baseUrl?: string; // one of AEZA_BASE_URLS; default — the .net branch
}

/**
 * Canonicalize a branch base URL, accepting either the panel origin or the full API URL (the
 * owner may paste either). Returns null for anything off the allowlist — a foreign host would
 * receive the API key.
 */
export function normalizeAezaBaseUrl(raw: string): string | null {
  const origin = raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v2$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return (AEZA_BASE_URLS as readonly string[]).includes(origin) ? origin : null;
}

/**
 * Read stored credentials: JSON `{ token, baseUrl? }`, or the bare API key for providers saved
 * before the branch field existed (no migration — the old format stays readable).
 */
export function parseAezaCredentials(raw: string): AezaCredentials {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as AezaCredentials;
  } catch {
    // Not JSON — a legacy raw key.
  }
  return { token: raw };
}

export interface AezaPaged<T> {
  items: T[];
  total: number;
}

export interface AezaAccount {
  balance: number; // minor units; prepaid (positive = available funds)
  currency: string; // ISO 4217, e.g. "RUB" / "USD" / "EUR"
}

export interface AezaService {
  id: number;
  name: string;
  ip?: string;
  price: number; // minor units, per paymentTerm
  paymentTerm: string; // hour|half_day|day|week|month|quarter_year|half_year|year|eternal
  expiresAt?: string; // ISO timestamp
  status: string; // active | suspended | deleted | ...
  typeSlug: string; // e.g. "vps"
  locationCode?: string; // ISO 3166-1 alpha-2, e.g. "de"
  productName?: string;
  autoProlong?: boolean;
  [key: string]: unknown;
}

export interface AezaTransaction {
  id: number;
  amount: number; // minor units
  type: string; // replenishment | prolong | buy | order | refund | compensation | manual | ...
  status: string; // created | performed | cancelled
  performedAt?: string;
  createdAt?: string;
  serviceId?: number; // parent service, for charges
}
