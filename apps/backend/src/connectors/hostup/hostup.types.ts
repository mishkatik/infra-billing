// HostUp public API v2 (https://cloud.hostup.se/api/v2, reference: https://developer.hostup.se).
// Only consumed fields are typed. Money is in major units of the row's `currencyCode` (SEK by
// default, EUR for accounts billed in euros). Lists use cursor pagination (`hasMore` +
// `nextCursor`); the billing activity ledger is paged by a zero-based `page` instead.

export type HostupServiceStatus =
  | 'active'
  | 'suspended'
  | 'terminated'
  | 'pending'
  | 'cancelled'
  | 'expired'
  | 'fraud'
  | 'transferred_out'
  | 'unknown';

export type HostupBillingCycle =
  | 'monthly'
  | 'quarterly'
  | 'semiannually'
  | 'annually'
  | 'biennially'
  | 'triennially'
  | 'free';

/** Cursor envelope shared by every cursor-paginated list endpoint. */
export interface HostupPage<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** GET /billing/account (scope read:billing). `creditBalance` is the prepaid account credit. */
export interface HostupBillingAccount {
  creditBalance: number;
  currencyCode: string;
  countryCode?: string | null;
  accountType?: 'private' | 'organisation';
}

export interface HostupServiceBilling {
  /** Recurring fixed-cycle amount; null for pay-as-you-go Cloud VPS. */
  amount: number | null;
  currencyCode: string;
  billingCycle: HostupBillingCycle | null;
  isPayg?: boolean;
  /** Domains: registration period in years (1-9); billingCycle is null for 4-9 years. */
  periodYears?: number | null;
}

/**
 * Verified paid period of a fixed-cycle VPS. Dates are calendar days in Europe/Stockholm
 * (`YYYY-MM-DD`). `paidThroughDate` is the inclusive last paid day, not an invoice due date.
 */
export interface HostupPaidPeriod {
  status: 'verified' | 'refreshing' | 'needs_review' | 'unavailable';
  paidThroughDate: string | null;
  /** Staff-granted coverage beyond the verified payment ("covered through"). */
  entitledThroughDate?: string | null;
  /** Due date of an already issued, still unpaid invoice for this VPS. */
  outstandingInvoiceDueDate: string | null;
  sourceInvoiceNumbers?: string[];
  observedAt?: string | null;
}

/** GET /vps item (scopes read:vm + read:services; read:vm alone returns an empty list). */
export interface HostupVps {
  id: string; // vps_…
  name: string;
  primaryIp: string | null;
  serviceStatus: HostupServiceStatus;
  powerState?: string | null;
  operatingSystem?: { displayName?: string | null } | null;
  customerMetadata?: { displayName?: string | null } | null;
  billing: HostupServiceBilling;
  resources?: { cpuCores?: number; memoryGb?: number; storageGb?: number };
  tags?: string[];
  createdAt?: string | null;
  /** Present only when HostUp has paid-period presentation enabled for the account. */
  paidPeriod?: HostupPaidPeriod;
}

/** GET /vps/paid-periods?ids=… (scope read:vm, 1-100 ids per call). */
export interface HostupPaidPeriodsResponse {
  results: Array<{ vpsId: string; paidPeriod: HostupPaidPeriod }>;
}

/** GET /shared-hosting item (scope read:services). */
export interface HostupSharedHosting {
  id: string; // acct_…
  name: string;
  primaryDomain: string | null;
  customName?: string | null;
  serviceStatus: HostupServiceStatus;
  billing: HostupServiceBilling;
  createdAt?: string | null;
  nextDueAt: string | null;
  expiresAt: string | null;
  controlPanel?: { type?: string };
  tags?: string[];
}

/** GET /domains item (scope read:domains). */
export interface HostupDomain {
  id: string; // dom_…
  name: string;
  serviceStatus: HostupServiceStatus;
  lifecycle?: { type?: string; autoRenewEnabled?: boolean | null };
  billing: HostupServiceBilling;
  createdAt?: string | null;
  expiresAt: string | null;
  nextDueAt: string | null;
  tags?: string[];
}

/** One row of GET /billing/activity?kind=transaction (scope read:billing). */
export interface HostupTransaction {
  id: string; // txn_…
  kind: 'payment' | 'refund' | 'credit_added' | 'rounding' | 'other';
  status: 'settled' | 'refunded' | 'pending' | 'failed' | 'cancelled' | 'unknown';
  description: string | null;
  method:
    | 'card'
    | 'accountCredit'
    | 'swish'
    | 'bankgiro'
    | 'sepa'
    | 'alipay'
    | 'crypto'
    | 'paypal'
    | 'invoice'
    | 'rounding'
    | 'other'
    | null;
  methodLabel: string | null;
  amount: number;
  currencyCode: string;
  createdAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export interface HostupTransactionActivity {
  kind: 'transaction';
  entries: HostupTransaction[];
  hasMore: boolean;
}

/** RFC 7807 Problem Details body on every 4xx/5xx; `code` is the stable machine-readable part. */
export interface HostupProblem {
  title?: string;
  detail?: string;
  code?: string;
  status?: number;
  requestId?: string;
}
