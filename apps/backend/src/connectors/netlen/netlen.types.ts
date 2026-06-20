// Netlen REST API response shapes (https://api.netlen.com.tr/v1). Only consumed fields are typed.
// Every response is wrapped in { success, data } (or { success:false, error, code } on failure).
// Verified live: money is USD; servers carry a monthly `amount`; `/balance/transactions` is a
// single deposit/withdraw ledger.

export interface NetlenEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface NetlenPagination {
  current_page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** List endpoints put the rows in `data` and the cursor in a sibling `pagination`. */
export interface NetlenListResponse<T> extends NetlenEnvelope<T[]> {
  pagination?: NetlenPagination;
}

export interface NetlenBalance {
  balance: number; // USD
  total_deposits?: number;
  total_withdrawals?: number;
  total_refunds?: number;
}

export interface NetlenServer {
  server_id: string;
  name: string;
  description?: string | null;
  status?: string;
  service?: string;
  ip_address?: string;
  ipv6_address?: string | null;
  package?: { id?: number; name?: string; specs?: Record<string, unknown> };
  amount?: number; // monthly price, USD
  created_at?: string;
  next_billing_date?: string; // "YYYY-MM-DD HH:mm:ss" (naive → treated as UTC)
  [key: string]: unknown;
}

export interface NetlenTransaction {
  id: number;
  type: string; // "deposit" | "withdraw"
  amount: number; // USD
  status?: string; // "success" | ...
  description?: string | null;
  payment_ref?: string | null;
  exchange_rate?: number | null; // TRY per USD at the time (informational; we keep USD)
  created_at?: string; // "YYYY-MM-DD HH:mm:ss" (naive → treated as UTC)
}
