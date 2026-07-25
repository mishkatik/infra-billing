export interface DoubleServersCredentials {
  username: string;
  password: string;
  totpSecret?: string;
}

export interface DoubleServersLoginResponse {
  success?: boolean;
  totp_required?: boolean;
  user_id?: number;
  username?: string;
  detail?: string | { msg?: string }[];
}

export interface DoubleServersMe {
  user_id: number;
  username: string;
  balance: number;
  two_fa_enabled?: boolean;
  two_fa_pending?: boolean;
}

export interface DoubleServersServer {
  id: number;
  name: string;
  ip?: string | null;
  provider?: string | null;
  plan?: string | null;
  location?: string | null;
  location_name?: string | null;
  status?: string | null;
  frozen?: boolean;
  blocked?: boolean;
  auto_renew?: boolean;
  expires_at?: string | null;
  created_at?: string | null;
  os?: string | null;
  price?: number | null;
}

export interface DoubleServersPage<T> {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  items: T[];
}

export interface DoubleServersTopup {
  transaction_id: string;
  amount_rub: number;
  amount_eur: number;
  method?: string | null;
  confirmed_at?: string | null;
}

export interface DoubleServersServerHistoryItem {
  id: number;
  created_at: string;
  type?: string | null;
  kind?: string | null;
  amount: number;
  balance_after?: number | null;
  description?: string | null;
}
