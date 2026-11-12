// A payment typed in by hand before the account's import caught up with it: the sync never touches
// manual rows, so once a connector learns to import top-ups the same money shows up twice.
import { DUPLICATE_PAYMENT_WINDOW_DAYS } from '@infra/shared';

const WINDOW_MS = DUPLICATE_PAYMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface PaymentLike {
  uuid: string;
  type: string;
  currency: string;
  amount: { toFixed(dp: number): string };
  paymentDate: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const key = (p: PaymentLike) => `${p.type}|${p.currency}|${p.amount.toFixed(2)}`;
const byDate = (a: PaymentLike, b: PaymentLike) =>
  a.paymentDate.getTime() - b.paymentDate.getTime();

/** The payment form stores a bare date as UTC midnight: read it as the middle of that day. */
function moment(p: PaymentLike): number {
  const t = p.paymentDate.getTime();
  return t % DAY_MS === 0 ? t + DAY_MS / 2 : t;
}

function groupByKey<T extends PaymentLike>(list: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const p of list) {
    const group = groups.get(key(p));
    if (group) group.push(p);
    else groups.set(key(p), [p]);
  }
  return groups;
}

/**
 * Pair manual payments with imported ones of the same type, currency and amount dated within
 * DUPLICATE_PAYMENT_WINDOW_DAYS, each payment used once. Every manual payment tries its closest
 * import first and may take one already paired if that pair can move to another import, so as
 * many duplicates as possible are found and five same-sized top-ups in a week still pair day to
 * day. Newest manual payment first.
 */
export function matchDuplicatePayments<T extends PaymentLike>(
  manual: T[],
  imported: T[],
): Array<{ manual: T; imported: T }> {
  const importsByKey = groupByKey(imported);
  const pairs: Array<{ manual: T; imported: T }> = [];
  for (const [k, group] of groupByKey(manual)) {
    const imports = importsByKey.get(k) ?? [];
    const candidates = new Map<T, T[]>();
    for (const m of group) {
      const gap = (i: T) => Math.abs(moment(m) - moment(i));
      candidates.set(
        m,
        imports.filter((i) => gap(i) <= WINDOW_MS).sort((a, b) => gap(a) - gap(b)),
      );
    }

    // Augmenting paths (Kuhn's algorithm): groups share one amount, so they stay small.
    const holderOf = new Map<T, T>();
    const assign = (m: T, seen: Set<T>): boolean => {
      for (const i of candidates.get(m) ?? []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const holder = holderOf.get(i);
        if (!holder || assign(holder, seen)) {
          holderOf.set(i, m);
          return true;
        }
      }
      return false;
    };
    for (const m of [...group].sort(byDate)) assign(m, new Set());
    for (const [i, m] of holderOf) pairs.push({ manual: m, imported: i });
  }
  return pairs.sort((a, b) => byDate(b.manual, a.manual));
}
