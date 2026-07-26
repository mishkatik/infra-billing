// Timeweb Cloud API response shapes. Only the fields we consume are typed.

export interface FinancesResponse {
  finances: { balance: number | string; currency: string };
}

export interface TimewebServer {
  id: number;
  name: string;
  location?: string;
  preset_id?: number | null;
  configurator_id?: number | null;
  [key: string]: unknown;
}

export interface TimewebServersResponse {
  servers: TimewebServer[];
}

export interface TimewebPreset {
  id: number;
  price: number; // monthly tariff in the account currency
  location?: string;
}

export interface PresetsResponse {
  server_presets: TimewebPreset[];
}

/** Per-service monthly price from GET /api/v1/account/services/cost. */
export interface TimewebServiceCost {
  service_id: number;
  type?: string;
  /** Server/base monthly tariff (excludes add-ons). */
  cost: number;
  /** Full monthly price including floating IPs and other add-ons. */
  total_cost?: number;
  info?: { name?: string; description?: string };
  configuration?: { disk?: number; cpu?: number; ram?: number };
  services?: Array<{ cost?: number; type?: string; info?: { name?: string; id?: string } }>;
}

export interface ServicesCostResponse {
  services_costs: TimewebServiceCost[];
}
