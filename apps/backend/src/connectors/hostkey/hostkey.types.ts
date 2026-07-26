/** InvAPI (invapi.hostkey.ru) response shapes — only consumed fields. */

/** Nested or flat login payload (live .ru nests under `result`, docs show flat). */
export interface HostkeyLoginPayload {
  token?: string;
  currency_code?: string;
  country_code?: string;
  whmcs_location?: string;
}

export interface HostkeyLoginResponse extends HostkeyLoginPayload {
  result?: HostkeyLoginPayload | string | number;
  message?: string;
  error?: string;
  code?: number | string;
}

export interface HostkeyCreditsResponse {
  result?: string | number;
  message?:
    | number
    | string
    | {
        credits?: { credit?: HostkeyCreditEntry | HostkeyCreditEntry[] };
      };
  error?: string;
  code?: number | string;
}

export interface HostkeyCreditEntry {
  amount?: number | string;
}

export interface HostkeyServer {
  id: number;
  status?: string;
  hostname?: string;
  name?: string;
  type?: string;
  IP?: string;
  due_date?: string;
  days_left?: number;
  price_EUR?: number | string;
  price_RUR?: number | string;
  price_USD?: number | string;
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
  result?: string | number;
  servers?: HostkeyServer[] | number[];
  message?: string;
  error?: string;
  code?: number | string;
}
