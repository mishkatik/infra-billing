/** InvAPI (invapi.hostkey.ru) response shapes — only consumed fields. */

export interface HostkeyLoginResponse {
  token?: string;
  currency_code?: string;
  country_code?: string;
  result?: string;
  message?: string;
  code?: number;
}

export interface HostkeyCreditsResponse {
  result?: string;
  message?: number | string;
  code?: number;
}

export interface HostkeyServer {
  id: number;
  status?: string;
  hostname?: string;
  name?: string;
  type?: string;
  is_prebill?: boolean;
  prebill_service_id?: number;
  prebill_rate?: number | string;
  prebill_period?: string;
  location?: string | { dc_location?: number; name?: string; code?: string };
  location_name?: string;
  short_location?: string;
  [key: string]: unknown;
}

export interface HostkeyListResponse {
  result?: string;
  servers?: HostkeyServer[];
  message?: string;
  code?: number;
}
