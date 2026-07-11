import type { AnalyticsSummary } from '@infra/shared';

type UpcomingBilling = AnalyticsSummary['upcomingBillings'][number];
type OverdueBilling = AnalyticsSummary['overdueBillings'][number];
type BalanceRunway = AnalyticsSummary['balanceRunway'][number];

export const EMOJI = {
  lowBalance: '<tg-emoji emoji-id="5258474669769497337">❗</tg-emoji>',
  upcoming: '<tg-emoji emoji-id="5258105663359294787">🗓</tg-emoji>',
  syncError: '<tg-emoji emoji-id="5260342697075416641">❌</tg-emoji>',
  test: '<tg-emoji emoji-id="5260726538302660868">✅</tg-emoji>',
  samples: '<tg-emoji emoji-id="5260268501515377807">📣</tg-emoji>',
  provider: '<tg-emoji emoji-id="5258093637450866522">🤖</tg-emoji>',
  service: '<tg-emoji emoji-id="5258423306255604960">💻</tg-emoji>',
  balance: '<tg-emoji emoji-id="5258368777350816286">🪙</tg-emoji>',
  amount: '<tg-emoji emoji-id="5258368777350816286">🪙</tg-emoji>',
  date: '<tg-emoji emoji-id="5258105663359294787">🗓</tg-emoji>',
  clock: '<tg-emoji emoji-id="5258258882022612173">⏲</tg-emoji>',
  info: '<tg-emoji emoji-id="5258503720928288433">ℹ</tg-emoji>',
} as const;

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Validate a cabinet URL: only http(s) is safe to put in a Telegram <a href>. */
function safeHttpUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Provider name as a bold deeplink to its cabinet (loginUrl); plain bold if no valid URL. */
export function providerLink(name: string, url?: string | null): string {
  const label = `<b>${esc(name)}</b>`;
  const href = safeHttpUrl(url);
  return href ? `<a href="${esc(href)}">${label}</a>` : label;
}

function ruDays(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'день';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'дня';
  return 'дней';
}

function whenLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'сегодня';
  if (daysUntil === 1) return 'завтра';
  return `через ${daysUntil} ${ruDays(daysUntil)}`;
}

/** "~N дн." for an estimated runway; "меньше суток" when the balance is essentially gone. */
function runwayLabel(days: number): string {
  if (days <= 0) return 'меньше суток';
  return `~${days} ${ruDays(days)}`;
}

function agoLabelRu(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'сегодня';
  if (daysOverdue === 1) return 'вчера';
  return `${daysOverdue} ${ruDays(daysOverdue)} назад`;
}

/** Low balance: an imminent charge the provider balance won't cover. */
export function lowBalanceMessage(ub: UpcomingBilling): string {
  return (
    `${EMOJI.lowBalance} <b>Низкий баланс</b>\n\n` +
    `${EMOJI.provider} ${providerLink(ub.providerName, ub.providerLoginUrl)}\n` +
    `${EMOJI.service} ${esc(ub.name)}\n\n` +
    `${EMOJI.clock} Списание <code>${esc(ub.cost)} ${esc(ub.currency)}</code> ${whenLabel(ub.daysUntil)} — баланса не хватит.\n` +
    `${EMOJI.balance} Баланс: <code>${esc(ub.providerBalance ?? '0')} ${esc(ub.providerBalanceCurrency ?? '')}</code>`
  );
}

/** Low runway: a prepaid provider whose balance is estimated to drain in a few days. */
export function lowRunwayMessage(r: BalanceRunway): string {
  return (
    `${EMOJI.balance} <b>Запас кончается</b>\n\n` +
    `${EMOJI.provider} ${providerLink(r.providerName, r.providerLoginUrl)}\n\n` +
    `${EMOJI.clock} Баланса хватит ещё на ${runwayLabel(r.daysLeft)} (трата ≈<code>${esc(r.burnPerDay)} ${esc(r.currency)}</code>/день).\n` +
    `${EMOJI.balance} Баланс: <code>${esc(r.balance)} ${esc(r.currency)}</code>`
  );
}

/** Overdue: the billing date already passed — pay or fix the date. */
export function overdueBillingMessage(ob: OverdueBilling): string {
  return (
    `${EMOJI.lowBalance} <b>Просроченное списание</b>\n\n` +
    `${EMOJI.provider} ${providerLink(ob.providerName, ob.providerLoginUrl)}\n` +
    `${EMOJI.service} ${esc(ob.name)}\n\n` +
    `${EMOJI.date} Дата: <code>${esc(ob.nextBillingAt.slice(0, 10))}</code> (${agoLabelRu(ob.daysOverdue)})\n` +
    `${EMOJI.amount} Сумма: <code>${esc(ob.cost)} ${esc(ob.currency)}</code>`
  );
}

/** Upcoming charge reminder (regardless of coverage). `day` is YYYY-MM-DD. */
export function upcomingBillingMessage(ub: UpcomingBilling, day: string): string {
  return (
    `${EMOJI.upcoming} <b>Скоро списание</b>\n\n` +
    `${EMOJI.provider} ${providerLink(ub.providerName, ub.providerLoginUrl)}\n` +
    `${EMOJI.service} ${esc(ub.name)}\n\n` +
    `${EMOJI.date} Дата: <code>${esc(day)}</code>\n` +
    `${EMOJI.amount} Сумма: <code>${esc(ub.cost)} ${esc(ub.currency)}</code>`
  );
}

/** Provider sync failure. */
export function syncErrorMessage(
  providerName: string,
  error: string,
  loginUrl?: string | null,
): string {
  return (
    `${EMOJI.syncError} <b>Ошибка синхронизации</b>\n\n` +
    `${EMOJI.provider} Провайдер: ${providerLink(providerName, loginUrl)}\n` +
    `${EMOJI.info} <code>${esc(error)}</code>`
  );
}

/** Manual "test" send to verify the Telegram configuration. */
export function testMessage(): string {
  return `${EMOJI.test} <b>Infra Billing</b> — тестовое уведомление`;
}

export function sampleMessages(): string[] {
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const sample: UpcomingBilling = {
    serviceUuid: '00000000-0000-0000-0000-000000000000',
    name: 'demo-vps',
    providerName: 'Тестовый провайдер',
    providerLoginUrl: 'https://example.com',
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
  const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  const sampleOverdue: OverdueBilling = {
    serviceUuid: '00000000-0000-0000-0000-000000000000',
    name: 'demo-vps',
    providerName: 'Тестовый провайдер',
    providerLoginUrl: 'https://example.com',
    nextBillingAt: `${fiveDaysAgo}T00:00:00.000Z`,
    cost: '500.00',
    currency: 'RUB',
    costBase: '500.00',
    daysOverdue: 5,
  };
  const sampleRunway: BalanceRunway = {
    providerUuid: '00000000-0000-0000-0000-000000000000',
    providerName: 'Тестовый провайдер',
    providerLoginUrl: 'https://example.com',
    balance: '14.30',
    currency: 'USD',
    burnPerDay: '0.80',
    daysLeft: 3,
    depletionAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    basis: 'snapshots',
    severity: 'critical',
  };
  return [
    `${EMOJI.samples} <b>Проверка уведомлений</b> — примеры всех типов ниже:`,
    overdueBillingMessage(sampleOverdue),
    lowBalanceMessage(sample),
    lowRunwayMessage(sampleRunway),
    upcomingBillingMessage(sample, inTwoDays),
    syncErrorMessage('Тестовый провайдер', 'HTTP 401: неверный API-токен', 'https://example.com'),
  ];
}
