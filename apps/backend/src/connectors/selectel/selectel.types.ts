// Selectel API response shapes (https://docs.selectel.ru/en/api/). Only consumed fields are typed.

export interface SelectelCredentials {
  accountId: string; // account number (Keystone domain name)
  username: string; // service user name
  password: string;
  projectName?: string; // Cloud Platform project; enables cloud (OpenStack) server listing
}

export interface BalancesResponse {
  data?: {
    settings?: { currency?: string };
    billings?: Array<{ final_sum?: number }>;
  };
}

export interface CatalogEndpoint {
  interface?: string;
  region?: string;
  url?: string;
}

export interface CatalogEntry {
  type?: string;
  endpoints?: CatalogEndpoint[];
}

export interface KeystoneAuth {
  token: string;
  catalog: CatalogEntry[];
  projectId?: string; // id of the scoped project (project-scoped tokens only)
}

export interface ConsumptionRow {
  value?: number; // kopecks
  period?: string; // naive day start, e.g. "2026-06-01T00:00:00"
  provider_key?: string;
  // Filled depending on group_type. For S3 the object is a Swift container; a server's disks and
  // public IPs carry the server's id in parent_id.
  project?: { id?: string };
  object?: { id?: string; name?: string; parent_id?: string | null };
  metric?: { region?: string };
}

/** Neutron router (`GET /v2.0/routers`). */
export interface NeutronRouter {
  id: string;
  name?: string;
  status?: string;
  created_at?: string;
}

/** Swift account listing entry (`GET /v1/<project_id>?format=json`). */
export interface SwiftContainer {
  name: string;
  bytes?: number;
  count?: number;
  last_modified?: string;
}

export interface NovaServer {
  id: string;
  name?: string;
  status?: string;
  created?: string;
  flavor?: { id?: string };
  image?: string | { id?: string };
  addresses?: unknown;
  'OS-EXT-AZ:availability_zone'?: string;
  [key: string]: unknown;
}
