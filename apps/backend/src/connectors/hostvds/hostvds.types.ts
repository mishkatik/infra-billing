// HostVDS / CloudCore API shapes. Both brands run one white-label panel: a billing API on the
// brand's site (/api/…, regions and plans are public) and OpenStack behind the brand's os-api
// host. Only consumed fields are typed.

export interface HostvdsBrand {
  /** OpenStack API: Keystone at /identity/v3, region services at /<region>/<service>/…. */
  osApi: string;
  /** Account currency. The HostVDS balance is in USD; CloudCore bills in RUB. */
  currency: string;
  /** CloudCore shows every price in RUB, while its plans API still labels them "usd". */
  priceCurrency?: string;
}

// Keys are the only accepted base URLs: the OpenStack password must not reach another host.
export const HOSTVDS_BRANDS: Record<string, HostvdsBrand> = {
  'https://hostvds.com': { osApi: 'https://os-api.hostvds.com', currency: 'USD' },
  'https://cloudcore.ru': {
    osApi: 'https://os-api.rocketcloud.ru',
    currency: 'RUB',
    priceCurrency: 'RUB',
  },
};

export const HOSTVDS_DEFAULT_BASE_URL = 'https://hostvds.com';

export interface HostvdsCredentials {
  username: string; // OpenStack login from the panel's API tab (hostvds-<uuid>)
  password: string;
  baseUrl?: string; // one of HOSTVDS_BRANDS keys; default — HostVDS
  // Optional website sign-in: enables the balance and the payment ledger.
  email?: string;
  webPassword?: string;
  totpSecret?: string; // base32 seed, when the website login has TOTP 2FA
}

/** Billing customer: the body of `POST /api/login/` and the item of `GET /api/customers/`. */
export interface HostvdsCustomer {
  balance?: number | string; // account currency (USD on HostVDS)
  totp_required?: boolean;
  totp_challenge?: string;
}

/** `GET /api/transactions/?limit&offset` (session). `amount` is in the account currency. */
export interface HostvdsTransaction {
  uuid: string;
  amount?: number | string;
  kind?: string; // "refill" = top-up, "invoice" = charge
  status?: string; // "ok"; other states are not money that moved
  created?: string; // ISO with +03:00
  message?: string;
  product?: { type?: string; external_id?: string; external_name?: string } | null;
}

export interface HostvdsTransactionsPage {
  count?: number;
  results?: HostvdsTransaction[];
}

/** `GET /api/regions/` (public). */
export interface HostvdsRegion {
  region: string; // "eu-west2"
  backend?: string; // "openstack"; other backends have no Nova servers
  country_code?: string; // lowercase ISO 3166-1 alpha-2
  city_code?: string;
  currency?: string; // lowercase, prices of the region's plans
}

/** `GET /api/plans/?region=<region>` (public). One plan per Nova flavor of the region. */
export interface HostvdsPlan {
  name?: string;
  flavor_uuid?: string; // = Nova flavor id; differs between regions
  kind?: string; // "standard" | "highload" | "highfreq_shared" | "baremetal" | …
  monthly?: number | string; // monthly cap of the hourly rate, in `currency`
  currency?: string;
  /** Network plans of the flavor ("default-50", "unlim-shared-100", …); default ones are free. */
  extra_opts?: { network_opts?: Record<string, { monthly_price?: number | string }> };
}

export interface NovaAddress {
  addr?: string;
  version?: number;
}

/** Nova `GET /servers/detail` without a microversion header: `flavor` is `{id}`. */
export interface NovaServer {
  id: string;
  name?: string;
  status?: string;
  created?: string;
  flavor?: { id?: string };
  addresses?: Record<string, NovaAddress[]>;
  /** Set by the panel: { network_plan, kind, os_distro }. Only `network_plan` is read. */
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NovaServersPage {
  servers?: NovaServer[];
  servers_links?: Array<{ rel?: string; href?: string }>;
}
