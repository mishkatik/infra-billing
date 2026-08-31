// HostBill User API response shapes. Only consumed fields are typed.

export interface HostbillCredentials {
  baseUrl: string; // e.g. https://secure.veesp.com/api
  username: string; // client portal email
  password: string;
  totpSecret?: string; // base32 OTP seed, if authenticator-app (TOTP) 2FA is enabled
}

export interface BalanceResponse {
  details?: { currency?: string; acc_balance?: string; acc_credit?: string };
}

export interface HostbillService {
  id: number | string;
  name?: string;
  domain?: string;
  total?: string;
  billingcycle?: string;
  next_due?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ServicesResponse {
  services?: HostbillService[];
}

export interface LoginResponse {
  token?: string;
  access_token?: string;
  error?: unknown;
  // Present (token stays null) when the account has 2FA enabled: a short-lived JWT to authorize
  // the /mfa/verify call plus the enabled methods. Same shape is returned by /mfa/verify (mfa: null).
  mfa?: {
    token?: string;
    methods?: string[];
    expires_at?: number;
  } | null;
}

export interface HostbillInvoice {
  id: number | string;
  number?: string;
  date?: string;
  datepaid?: string;
  total?: string;
  subtotal?: string;
  status?: string;
  currency?: string;
  [key: string]: unknown;
}

export interface InvoicesResponse {
  invoices?: HostbillInvoice[];
}
