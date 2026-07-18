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
