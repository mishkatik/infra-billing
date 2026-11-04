// Yandex Cloud API response shapes and stored credentials. Only consumed fields are typed.

// Decrypted credentials, normalized from the service-account authorized-key JSON. Scope (folders,
// billing account) is always auto-resolved by the connector, so it is not stored.
export interface YandexCredentials {
  keyId: string; // authorized key id → JWT `kid`
  serviceAccountId: string; // → JWT `iss`
  privateKey: string; // PEM private key, signs the JWT (PS256)
}

// The raw authorized-key file produced by Yandex Cloud (yc iam key create / API). Parsed on save.
export interface YandexAuthorizedKey {
  id?: string;
  service_account_id?: string;
  private_key?: string;
}

export interface IamTokenResponse {
  iamToken: string;
  expiresAt: string; // RFC3339
}

export interface YandexBillingAccount {
  id: string;
  name: string;
  currency: string; // RUB / USD / KZT
  active: boolean;
  balance: string; // decimal string, positive = funds
}

export interface BillingAccountsResponse {
  billingAccounts?: YandexBillingAccount[];
  nextPageToken?: string;
}

export interface YandexInstance {
  id: string;
  folderId: string;
  name?: string;
  zoneId?: string; // e.g. "ru-central1-a" → country
  platformId?: string;
  status?: string;
  resources?: { memory?: string; cores?: string; coreFraction?: string; gpus?: string };
  [key: string]: unknown;
}

export interface YandexCdnResource {
  id: string;
  folderId: string;
  cname?: string; // the CDN endpoint hostname, e.g. "cdn.example.com"
  active?: boolean; // false = content is not served to clients
  originGroupName?: string;
  originProtocol?: string; // HTTP / HTTPS / MATCH
  providerType?: string; // e.g. "ourcdn"
  secondaryHostnames?: string[];
  [key: string]: unknown;
}

// Object Storage bucket from the management API (storage.api.cloud.yandex.net), not the S3 API.
export interface YandexBucket {
  name: string; // globally unique; also the bucket's resource id in billing
  folderId: string;
  defaultStorageClass?: string; // STANDARD / COLD / ICE
  versioning?: string; // e.g. "VERSIONING_DISABLED"
  maxSize?: string; // byte count string, "0" = unlimited
  anonymousAccessFlags?: { read?: boolean; list?: boolean; configRead?: boolean };
  createdAt?: string;
  [key: string]: unknown;
}

// Billing Usage API (gRPC) shapes. Decimals arrive as { value: "123.45" } strings; the report is
// requested with DAY aggregation so `periodic` holds one point per calendar day.
export interface StringDecimal {
  value?: string;
}

export interface UsageReportPeriodicData {
  cost?: StringDecimal; // gross consumption, before credits
  expense?: StringDecimal; // final billable (cost minus credits) — the real money spent
  timestamp?: { seconds?: string | number }; // start of the aggregation period
}

export interface UsageReportEntityData {
  expense?: StringDecimal; // period total for the entity (final billable)
  periodic?: UsageReportPeriodicData[];
}

export interface UsageReportResponse {
  currency?: string; // enum name, e.g. "RUB"
  entitiesData?: UsageReportEntityData[];
}

// Per-resource report: one entity per resource id and service instance type, so an id can repeat.
export interface ResourceUsageReportEntityData {
  resource?: { id?: string }; // instance / CDN resource id, bucket name for Object Storage
  periodic?: UsageReportPeriodicData[];
}

export interface ResourceUsageReportResponse {
  currency?: string;
  entitiesData?: ResourceUsageReportEntityData[];
}
