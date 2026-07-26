// Hetzner Cloud API response shapes (https://docs.hetzner.cloud). Only consumed fields are typed.

export interface HetznerPrice {
  net: string;
  gross: string;
}

export interface HetznerServerTypePrice {
  location: string;
  price_hourly: HetznerPrice;
  price_monthly: HetznerPrice;
}

export interface HetznerServerType {
  id: number;
  name: string;
  prices: HetznerServerTypePrice[];
}

export interface HetznerLocation {
  name: string;
  country: string; // ISO 3166-1 alpha-2
  network_zone?: string;
  city?: string;
}

export interface HetznerServer {
  id: number;
  name: string;
  server_type: HetznerServerType;
  /** Preferred since 2025-12; `datacenter` was removed after 2026-07-01. */
  location?: HetznerLocation;
  /** @deprecated Removed from API responses after 2026-07-01. */
  datacenter?: { location: HetznerLocation };
  [key: string]: unknown;
}

export interface HetznerServersResponse {
  servers: HetznerServer[];
  meta?: { pagination?: { next_page: number | null } };
}
