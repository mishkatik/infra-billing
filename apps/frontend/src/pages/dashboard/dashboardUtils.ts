import type { AnalyticsSummary } from '@infra/shared';
import type { TFunction } from 'i18next';
import type { InkState } from '@/components/ink/InkGlyph';
import { formatDateShort, formatMoney } from '@/utils/format';

type Upcoming = AnalyticsSummary['upcomingBillings'][number];

export const dayLabel = (t: TFunction, n: number) =>
  n <= 0
    ? t('dashboard.due.today')
    : n === 1
      ? t('dashboard.due.tomorrow')
      : t('dashboard.due.inDays', { n });

export const agoLabel = (t: TFunction, n: number) =>
  n <= 0
    ? t('dashboard.ago.today')
    : n === 1
      ? t('dashboard.ago.yesterday')
      : t('dashboard.ago.daysAgo', { n });

/** Glyph of an upcoming charge: severity wins, then what we know about the balance. */
export function upcomingState(b: Upcoming): InkState {
  if (b.severity === 'critical') return 'failed';
  if (b.severity === 'warning') return 'warn';
  if (b.covered == null) return 'pending';
  return b.covered ? 'ok' : 'warn';
}

export function coverageLabel(t: TFunction, covered: boolean | null): string {
  if (covered == null) return t('dashboard.upcoming.balanceUnknown');
  return covered ? t('dashboard.upcoming.balanceOk') : t('dashboard.upcoming.insufficientBalance');
}

export const byDaysUntil = (a: Upcoming, b: Upcoming) => a.daysUntil - b.daysUntil;

/**
 * "Provider · label" — the analytics rows carry a label only for multi-account providers, '' for
 * the original unlabelled one (named by `mainLabel`, i.e. t('common.accountMain')).
 */
export const withAccount = (
  providerName: string,
  accountLabel: string | null,
  mainLabel: string,
) => (accountLabel == null ? providerName : `${providerName} · ${accountLabel || mainLabel}`);

/** Deep link that opens the provider card focused on one of its accounts. */
export const accountLink = (providerUuid: string, accountUuid: string) =>
  `/providers?selected=${providerUuid}&account=${accountUuid}`;

export interface AttentionProvider {
  uuid: string;
  name: string;
  accountUuid: string;
  accountLabel: string | null;
  faviconLink: string | null;
  loginUrl: string | null;
  iconName: string | null;
  iconBg: string | null;
}

export interface AttentionRow {
  key: string;
  state: 'failed' | 'warn';
  provider: AttentionProvider;
  /** Set when the row is about one service rather than the whole provider account. */
  service: { uuid: string; name: string } | null;
  /** Toned text: what is wrong (or, for a top-up, which charges it saves). */
  note: string;
  when: string;
  amount: string;
}

/** The dashboard's problems by kind; each kind gets its own card. */
export interface AttentionGroups {
  overdue: AttentionRow[];
  /** Charges in the next week the balance won't (or may not) cover. */
  uncovered: AttentionRow[];
  /** The remedy for `uncovered`: how much to top up each account, and before when. */
  topUps: AttentionRow[];
  /** Prepaid balances about to run dry, critical first. */
  runway: AttentionRow[];
}

interface AttentionInput {
  overdue: AnalyticsSummary['overdueBillings'];
  upcoming: AnalyticsSummary['upcomingBillings'];
  runway: AnalyticsSummary['balanceRunway'];
  topUps: AnalyticsSummary['balanceTopUps'];
}

type ProviderFields = Pick<
  AnalyticsSummary['upcomingBillings'][number],
  | 'providerUuid'
  | 'providerName'
  | 'accountUuid'
  | 'accountLabel'
  | 'providerFaviconLink'
  | 'providerLoginUrl'
  | 'providerIconName'
  | 'providerIconBg'
>;

const providerOf = (r: ProviderFields): AttentionProvider => ({
  uuid: r.providerUuid,
  name: r.providerName,
  accountUuid: r.accountUuid,
  accountLabel: r.accountLabel,
  faviconLink: r.providerFaviconLink,
  loginUrl: r.providerLoginUrl,
  iconName: r.providerIconName,
  iconBg: r.providerIconBg,
});

/** Everything on the dashboard that needs the owner's hand, split by kind. */
export function buildAttentionGroups(
  t: TFunction,
  { overdue, upcoming, runway, topUps }: AttentionInput,
): AttentionGroups {
  const critical = upcoming.filter((b) => b.severity === 'critical').sort(byDaysUntil);

  const overdueRows = overdue.map<AttentionRow>((b) => ({
    key: `overdue:${b.serviceUuid}`,
    state: 'failed',
    provider: providerOf(b),
    service: { uuid: b.serviceUuid, name: b.name },
    note: agoLabel(t, b.daysOverdue),
    when: formatDateShort(b.nextBillingAt),
    amount: formatMoney(b.cost, b.currency),
  }));

  const uncovered = critical.map<AttentionRow>((b) => {
    const balance =
      b.accountBalance != null
        ? t('dashboard.attention.balance', {
            amount: formatMoney(b.accountBalance, b.accountBalanceCurrency),
          })
        : null;
    return {
      key: `critical:${b.serviceUuid}`,
      state: 'failed',
      provider: providerOf(b),
      service: { uuid: b.serviceUuid, name: b.name },
      // Critical always means "not covered" or "unknown", never a covered charge.
      note: [coverageLabel(t, b.covered === true ? false : b.covered), balance]
        .filter(Boolean)
        .join(' · '),
      when: dayLabel(t, b.daysUntil),
      amount: formatMoney(b.cost, b.currency),
    };
  });

  const topUpRows: AttentionRow[] = [];
  for (const u of topUps) {
    // A top-up only belongs here when it would save a critical charge on the same account;
    // the row names those charges so the remedy reads next to its problem.
    const saves = critical.filter((b) => b.accountUuid === u.accountUuid);
    const soonest = saves[0];
    if (!soonest) continue;
    topUpRows.push({
      key: `topup:${u.accountUuid}`,
      state: 'warn',
      provider: {
        ...providerOf(u),
        faviconLink: u.providerFaviconLink ?? soonest.providerFaviconLink,
        loginUrl: u.providerLoginUrl ?? soonest.providerLoginUrl,
        iconName: u.providerIconName ?? soonest.providerIconName,
        iconBg: u.providerIconBg ?? soonest.providerIconBg,
      },
      service: null,
      note: saves.map((b) => b.name).join(', '),
      when: dayLabel(t, soonest.daysUntil),
      amount: formatMoney(u.amount, u.currency),
    });
  }

  const runwayRow = (r: AnalyticsSummary['balanceRunway'][number]): AttentionRow => ({
    key: `runway:${r.accountUuid}`,
    state: r.severity === 'critical' ? 'failed' : 'warn',
    provider: providerOf(r),
    service: null,
    note: dayLabel(t, r.daysLeft),
    when: t('dashboard.attention.perDay', { amount: formatMoney(r.burnPerDay, r.currency) }),
    amount: formatMoney(r.balance, r.currency),
  });

  return {
    overdue: overdueRows,
    uncovered,
    topUps: topUpRows,
    runway: [
      ...runway.filter((r) => r.severity === 'critical').map(runwayRow),
      ...runway.filter((r) => r.severity === 'warning').map(runwayRow),
    ],
  };
}
