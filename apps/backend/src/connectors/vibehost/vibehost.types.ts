// VibeHost public API response shapes (https://api.vibehost.net/v3/api-docs).
// Only fields consumed by the connector are represented here.

export interface VibehostAccount {
  telegramId: number;
  balance: number;
  referralEarnings?: number;
  locale?: string;
  resellerDiscountPercent?: number;
  role?: string;
  registeredAt?: string;
}

export interface VibehostVps {
  id: number;
  serverId?: number | null;
  ip?: string | null;
  ipv6?: string | null;
  type?: string | null;
  name?: string | null;
  label?: string | null;
  paidTill?: string | null;
  monthlyBill?: number | null;
  renewalPrice?: number | null;
  blocked?: boolean;
  lifecycle?: string | null;
  location?: string | null;
  backupEnabled?: boolean;
  provider?: string | null;
}

export interface VibehostDedicated {
  id: number;
  serverNumber?: string | null;
  serverIp?: string | null;
  productId?: string | null;
  location?: string | null;
  status?: string | null;
  label?: string | null;
  paidTill?: string | null;
  monthlyBill?: number | null;
  renewalPrice?: number | null;
  windowsEnabled?: boolean;
  windowsMonthlyPrice?: number | null;
  blocked?: boolean;
  lifecycle?: string | null;
  auction?: boolean;
  refundable?: boolean;
  provider?: string | null;
}

export interface VibehostTransaction {
  id: number;
  type: 'DEPOSIT' | 'PURCHASE' | 'RENEWAL' | 'REFUND' | 'REFERRAL_BONUS' | 'POOL_COST' | string;
  amount: number;
  description?: string | null;
  createdAt: string;
}

export interface VibehostTransactionPage {
  content: VibehostTransaction[];
  number: number;
  totalPages: number;
  last: boolean;
  empty: boolean;
}
