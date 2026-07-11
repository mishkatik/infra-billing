import dayjs from 'dayjs';

/**
 * Whole days a billing date is past due (0 = earlier today); null = not overdue (future/undated).
 * Exact complement of the upcoming filter's `isAfter(now)` — a charge earlier today lands here,
 * so no service can fall into a gap between the two lists.
 */
export function overdueDays(nextBillingAt: Date | null, now: dayjs.Dayjs): number | null {
  if (!nextBillingAt || dayjs(nextBillingAt).isAfter(now)) return null;
  return Math.max(0, now.startOf('day').diff(dayjs(nextBillingAt).startOf('day'), 'day'));
}
