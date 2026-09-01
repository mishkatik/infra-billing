import type { BillingSeverity } from '@infra/shared';

/**
 * Coverage severity for one upcoming dated charge.
 *
 * critical — due in ≤7 days and the prepaid balance won't cover it (covered=false), or the
 *            panel can't see a balance at all (covered=null) on a non-postpaid provider
 *            (manual kind / connector without a balance API) — needs a hands-on check.
 * warning  — underfunded but further out (covered=false beyond 7 days), or simply very
 *            soon (≤3 days) regardless of coverage.
 * ok       — everything else, incl. unknown coverage 8+ days out and postpaid providers
 *            (their charges are invoice-billed, a missing balance is not a risk).
 */
export function chargeSeverity(
  covered: boolean | null,
  daysUntil: number,
  isPostpaid: boolean,
): BillingSeverity {
  if (covered === false && daysUntil <= 7) return 'critical';
  if (covered === null && !isPostpaid && daysUntil <= 7) return 'critical';
  if (covered === false || daysUntil <= 3) return 'warning';
  return 'ok';
}
