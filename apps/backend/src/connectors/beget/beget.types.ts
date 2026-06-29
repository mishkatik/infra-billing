// Beget API response shapes. Only consumed fields are typed.
// Two APIs on api.beget.com: the new Cloud API (/v1/*, JSON, snake_case — verified live) and the
// legacy hosting API (/api/user/getAccountInfo, JSON envelope) used only for the account balance.

export interface BegetCredentials {
  username: string; // Beget account login (cp.beget.com) — used for both APIs
  password: string; // account password — for the new Cloud API POST /v1/auth → JWT
  totpSecret?: string; // base32 OTP seed — lets us pass the 2FA code to /v1/auth
  apiPassword?: string; // separate panel "Beget API" password — enables balance via the legacy API
}

/** POST /v1/auth → 200 with { token } on success, or { error } (an enum) on failure. */
export interface BegetAuthResponse {
  token?: string;
  error?: string;
}

export interface BegetRegion {
  id: string; // "ru1", "kz1", …
  country?: string; // ISO 3166-1 alpha-2
  short_name?: string;
  name_en?: string;
  available?: boolean;
}
export interface BegetRegionListResponse {
  regions?: BegetRegion[];
}

export interface BegetVpsConfiguration {
  id?: string;
  name?: string;
  cpu_count?: number;
  disk_size?: number; // MB
  memory?: number; // MB
  bandwidth_public?: number;
  price_day?: number; // RUB
  price_month?: number; // RUB
  group?: string;
  region?: string;
}

export interface BegetVps {
  id: string; // UUID v4 — stable unique id
  slug?: string;
  display_name?: string;
  hostname?: string;
  status?: string; // "RUNNING" | "STOPPED" | …
  region?: string; // region id, mapped to a country via /v1/vps/region
  ip_address?: string;
  additional_ip_address?: string[]; // all assigned IPv4s (incl. the primary) — each billed separately
  date_create?: string; // ISO 8601 with offset (creation date, NOT next billing)
  configuration?: BegetVpsConfiguration;
  software?: { name?: string; display_name?: string; version?: string };
  [key: string]: unknown;
}
export interface BegetVpsListResponse {
  vps?: BegetVps[];
  total_count?: number;
}

/**
 * Managed cloud service (GET /v1/cloud): MySQL / PostgreSQL / S3 / CDN / Network Drive.
 * Shape from the public proto (snake_case, verified on the list envelope); the element itself
 * was not seen live (the test account had 0 cloud services), so it is read defensively.
 */
export interface BegetCloudService {
  id: string; // UUID v4
  slug?: string;
  display_name?: string;
  type?: string; // "MYSQL8" | "POSTGRESQL15" | "S_3" | "CDN" | "NETWORK_DRIVE" | …
  status?: string;
  region?: string;
  price_day?: number; // RUB
  price_month?: number; // RUB (0/absent for usage-billed S3)
  [key: string]: unknown;
}
export interface BegetCloudListResponse {
  service?: BegetCloudService[];
  total_count?: number;
}

/** Legacy GET /api/user/getAccountInfo envelope: { status, answer: { status, result } }. */
export interface BegetLegacyAccountInfo {
  status?: string; // "success" | "error"
  error_text?: string;
  error_code?: string;
  answer?: {
    status?: string;
    result?: { user_balance?: number; [key: string]: unknown };
    errors?: unknown;
  };
}
