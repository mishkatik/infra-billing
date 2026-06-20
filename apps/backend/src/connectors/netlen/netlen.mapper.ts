import Decimal from 'decimal.js';
import { PaymentData, ServiceData } from '../connector.interface';
import { NetlenServer, NetlenTransaction } from './netlen.types';

// Netlen denominates all money in USD (verified live: server `amount` ~7.99 alongside a
// TRY-per-USD `exchange_rate` of ~44 on deposits). No money field carries a currency code.
export const NETLEN_CURRENCY = 'USD';

/** Parse Netlen's naive "YYYY-MM-DD HH:mm:ss" timestamp as UTC. */
function parseDate(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Map a Netlen server to our domain Service. `amount` is the MONTHLY price in USD. */
export function mapNetlenServer(s: NetlenServer): ServiceData {
  return {
    externalId: String(s.server_id),
    name: s.name || `server-${s.server_id}`,
    type: 'vps',
    // The server object exposes no location/country field → left unset (owner edits).
    cost: s.amount != null ? new Decimal(s.amount) : undefined,
    currency: NETLEN_CURRENCY,
    period: 'monthly',
    nextBilling: parseDate(s.next_billing_date),
    meta: { ...s },
  };
}

/**
 * Map a Netlen ledger transaction to a Payment. The ledger is one id sequence of `deposit`
 * (money in → topup) and `withdraw` (service charge → charge); only successful rows are
 * imported (unknown type/status → null, skipped). Transactions carry no server id (only the
 * service name in the description), so charges stay at the provider level (no service link).
 */
export function mapNetlenTransaction(t: NetlenTransaction): PaymentData | null {
  if (t.status && t.status !== 'success') return null;
  // `/balance` reports `total_refunds`, but no refund row appeared in the live ledger, so the
  // refund `type` string is unknown — we don't invent it. Such a row currently falls through to
  // null (skipped), which means a refund would NOT reduce spend. Once the real type is confirmed
  // live, map it to a negated `topup` (cf. BILLmanager `return/...` in billmgr.connector.ts).
  const type = t.type === 'deposit' ? 'topup' : t.type === 'withdraw' ? 'charge' : null;
  if (type === null) return null;
  const date = parseDate(t.created_at);
  if (!date) return null;
  return {
    externalId: `txn:${t.id}`,
    type,
    amount: new Decimal(t.amount ?? 0),
    currency: NETLEN_CURRENCY,
    date,
    description: t.description ?? undefined,
  };
}
