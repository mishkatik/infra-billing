import dayjs from 'dayjs';

/**
 * Whole calendar days a billing date is past due; null = not overdue (dated today, future, undated).
 * `nextBillingAt` is a date by intent — connectors and the manual form write UTC midnight — so the
 * cut is the calendar day, not the instant: a charge dated today is still ahead of us, not missed.
 * The result is therefore always >= 1 (1 = yesterday). The upcoming filter uses a null result as
 * its lower bound, so the two lists partition dated services with no gap and no overlap.
 * "Today" is the process day; the backend runs in UTC, so the flip happens at 00:00 UTC.
 */
export function overdueDays(nextBillingAt: Date | null, now: dayjs.Dayjs): number | null {
  if (!nextBillingAt) return null;
  const today = now.startOf('day');
  const due = dayjs(nextBillingAt);
  if (!due.isBefore(today)) return null;
  return today.diff(due.startOf('day'), 'day');
}
