// Telegram notification message templates — kept here so formats and emoji are easy to change in
// one place. All messages use HTML parse_mode (grammY Api). To use a custom Telegram emoji, replace
// an EMOJI value with a <tg-emoji> tag, e.g.
//   lowBalance: '<tg-emoji emoji-id="5368324170671202286">⚠️</tg-emoji>'
// (the bot must have access to that custom emoji; the inner text is the fallback).

import type { AnalyticsSummary } from '@infra/shared';

type UpcomingBilling = AnalyticsSummary['upcomingBillings'][number];

/** Leading emoji per alert type — swap to <tg-emoji emoji-id="…">…</tg-emoji> for custom ones. */
export const EMOJI = {
  lowBalance: '⚠️',
  upcoming: '🗓',
  syncError: '❌',
  test: '✅',
} as const;

/** Escape user-provided values for Telegram HTML. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Low balance: an imminent charge the provider balance won't cover. */
export function lowBalanceMessage(ub: UpcomingBilling, baseCurrency: string): string {
  const when = ub.daysUntil === 0 ? 'today' : `in ${ub.daysUntil} day(s)`;
  return (
    `${EMOJI.lowBalance} <b>Low balance</b>\n` +
    `${esc(ub.providerName)} — <b>${esc(ub.name)}</b>\n` +
    `Not enough to cover charge <code>${esc(ub.costBase)} ${esc(baseCurrency)}</code> (${when})\n` +
    `Balance: <code>${esc(ub.providerBalance ?? '0')} ${esc(ub.providerBalanceCurrency ?? '')}</code>`
  );
}

/** Upcoming charge reminder (regardless of coverage). `day` is YYYY-MM-DD. */
export function upcomingBillingMessage(ub: UpcomingBilling, day: string): string {
  return (
    `${EMOJI.upcoming} <b>Upcoming charge</b>\n` +
    `${esc(ub.providerName)} — <b>${esc(ub.name)}</b>\n` +
    `Date: <code>${esc(day)}</code>\n` +
    `Amount: <code>${esc(ub.cost)} ${esc(ub.currency)}</code>`
  );
}

/** Provider sync failure. */
export function syncErrorMessage(providerName: string, error: string): string {
  return (
    `${EMOJI.syncError} <b>Sync error</b>\n` +
    `Provider: <b>${esc(providerName)}</b>\n` +
    `<code>${esc(error)}</code>`
  );
}

/** Manual "test" send to verify the Telegram configuration. */
export function testMessage(): string {
  return `${EMOJI.test} <b>Infra Billing</b>: test notification`;
}

/**
 * One sample of EVERY notification type (with obvious demo data) — used by the "test" send so you
 * can preview all formats/emoji in Telegram at once. Not throttled, not persisted.
 */
export function sampleMessages(): string[] {
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const sample: UpcomingBilling = {
    serviceUuid: '00000000-0000-0000-0000-000000000000',
    name: 'demo-vps',
    providerName: 'Example provider',
    nextBillingAt: `${inTwoDays}T00:00:00.000Z`,
    cost: '500.00',
    currency: 'RUB',
    costBase: '500.00',
    daysUntil: 2,
    providerBalance: '120.00',
    providerBalanceCurrency: 'RUB',
    covered: false,
    severity: 'critical',
  };
  return [
    `${EMOJI.test} <b>Notification test</b> — samples of all types below:`,
    lowBalanceMessage(sample, 'RUB'),
    upcomingBillingMessage(sample, inTwoDays),
    syncErrorMessage('Example provider', 'HTTP 401: invalid API token'),
  ];
}
