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

/** Dedicated Servers API list envelope; `status` is "SUCCESS" once the task has a result. */
export interface DedicatedList<T> {
  status?: string;
  item_count?: number;
  result?: T[];
}

export interface DedicatedPricePlan {
  type?: string; // "month" | "day"
  period?: number; // how many of `type` the plan pays for
}

/** A rented dedicated resource (`GET /servers/v2/resource`). Prices are in whole units, not kopecks. */
export interface DedicatedResource {
  uuid: string;
  user_desc?: string | null;
  info?: string | null; // tariff, e.g. "AR44-NVMe"
  config_name?: string | null;
  service_type?: string; // "serverchip", "server", "colocation", …
  state?: string;
  location_uuid?: string;
  created?: number; // epoch seconds
  paid_till?: number | null; // epoch seconds
  is_not_prolonged?: boolean;
  billing?: {
    currency?: string;
    current_price_plan?: DedicatedPricePlan | null;
    next_price_plan?: DedicatedPricePlan | null;
    price?: { plan_price?: number | null; future_price?: number | null } | null;
  } | null;
}

export interface DedicatedLocation {
  uuid: string;
  name?: string; // "SPB-2", "MSK-7", "TAS-1", …
}

/** Account balance transaction (`GET /v2/billing/transactions`). */
export interface BillingTransaction {
  created?: string; // naive Moscow time, e.g. "2026-10-29T14:43:32.278868"
  price?: number; // kopecks, negative for outgoing
  state?: string; // PAID, PRE_PAID, DELETED
  dir?: string; // incoming | outgoing
  balance?: string; // main | bonus
  transaction_group?: string; // payment, withdraw, refund, manual
  description?: { ru?: string; en?: string } | null;
  id_meta?: { billing?: string; id?: number[]; service_name?: string | null } | null;
  server_meta?: { main_resource_uuid?: string | null } | null;
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
