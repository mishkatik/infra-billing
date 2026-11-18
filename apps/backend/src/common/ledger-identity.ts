import Decimal from 'decimal.js';

interface LedgerEntry {
  type: string;
  currency: string;
  paymentDate: Date;
  amount: { toString(): string };
}

/** Account-scoped identity when the provider supplies no transaction reference. */
export function fallbackPaymentId(entry: LedgerEntry): string {
  const amount = new Decimal(entry.amount.toString()).toFixed(2);
  return `unref:${entry.type}:${entry.currency}:${entry.paymentDate.toISOString()}:${amount}`;
}

/** Resolve the entire feed before writing. An anonymous row can only match one ledger entry. */
export function resolveLedgerIds<T extends LedgerEntry & { externalId: string }>(
  rows: T[],
  stored: (LedgerEntry & { externalId: string | null })[],
) {
  const groups = new Map<string, T[]>();
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.externalId)) throw new Error('Duplicate payment identifier in billing feed');
    ids.add(row.externalId);
    const key = fallbackPaymentId(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const previous = new Map<string, Set<string>>();
  for (const entry of stored) {
    if (entry.externalId == null) continue; // manual payments never participate
    const key = fallbackPaymentId(entry);
    const group = previous.get(key);
    if (group) group.add(entry.externalId);
    else previous.set(key, new Set([entry.externalId]));
  }

  const result = [];
  for (const [key, group] of groups) {
    const old = previous.get(key);
    const ambiguous = () => new Error(`Ambiguous billing entries for ${key}`);
    if (group.some((row) => row.externalId === key)) {
      // An explicit reference elsewhere in the feed already owns its row (e.g. a corrected amount).
      const candidates = [...(old ?? [])].filter((id) => id === key || !ids.has(id));
      if (group.length !== 1 || candidates.length > 1) throw ambiguous();
      // A provider may omit a reference it supplied on a previous sync. Keep that stored key.
      const id = candidates[0] ?? key;
      result.push({ row: group[0], lookupId: id, externalId: id });
      continue;
    }
    // A reference appeared. Promote the anonymous row in place, preserving its payment UUID.
    const unmatched = old?.has(key) ? group.filter((row) => !old.has(row.externalId)) : [];
    if (old?.has(key) && unmatched.length !== 1) throw ambiguous();
    for (const row of group) {
      result.push({
        row,
        lookupId: row === unmatched[0] ? key : row.externalId,
        externalId: row.externalId,
      });
    }
  }
  return result;
}
