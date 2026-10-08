import type { AnalyticsSummary } from '@infra/shared';
import { IconRefresh, IconServer2 } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useForecast, useSummary } from '@/api/analytics';
import { apiErrorMessage } from '@/api/client';
import { useProjects } from '@/api/projects';
import { useProviders, useSyncActivity, useSyncAllProviders } from '@/api/providers';
import { InkGlyph, type InkState } from '@/components/ink/InkGlyph';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { notifyError } from '@/utils/notify';
import { notifySyncAll } from '@/utils/syncNotify';
import { AttentionCards } from './AttentionCards';
import { ByProjectList, ByTypeList } from './BreakdownLists';
import { ByProviderCard } from './ByProviderCard';
import { buildAttentionGroups } from './dashboardUtils';
import { DashboardHero } from './DashboardHero';
import { LastSyncCard } from './LastSyncCard';
import { SpendByMonthCard } from './SpendByMonthCard';
import { UpcomingTable } from './UpcomingTable';

/** Dev-only sample runway rows so the attention table can be previewed without live low balances. */
const PREVIEW_RUNWAY: AnalyticsSummary['balanceRunway'] = [
  {
    providerUuid: '00000000-0000-0000-0000-000000000101',
    accountUuid: '00000000-0000-0000-0000-000000000201',
    providerName: 'selectel.ru',
    accountLabel: 'reserve',
    providerKind: 'selectel',
    providerLoginUrl: 'https://my.selectel.ru',
    providerFaviconLink: null,
    providerIconName: null,
    providerIconBg: null,
    balance: '777.61',
    currency: 'RUB',
    burnPerDay: '359.74',
    daysLeft: 2,
    depletionAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    basis: 'snapshots',
    severity: 'critical',
  },
  {
    providerUuid: '00000000-0000-0000-0000-000000000102',
    accountUuid: '00000000-0000-0000-0000-000000000202',
    providerName: 'timeweb.cloud',
    accountLabel: null,
    providerKind: 'timeweb',
    providerLoginUrl: 'https://timeweb.cloud/my',
    providerFaviconLink: null,
    providerIconName: null,
    providerIconBg: null,
    balance: '1301.17',
    currency: 'RUB',
    burnPerDay: '173.08',
    daysLeft: 7,
    depletionAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    basis: 'services',
    severity: 'warning',
  },
];

export function DashboardPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { data: summary, isLoading } = useSummary();
  // 10 months back + the current one + 3 ahead.
  const { data: forecast } = useForecast(3, 10);
  const { data: providers } = useProviders();
  const { data: projectsList } = useProjects();
  const syncAll = useSyncAllProviders();
  const activity = useSyncActivity();
  const providerOf = (uuid: string) => providers?.find((p) => p.uuid === uuid);
  const projectOf = (uuid: string) => projectsList?.find((p) => p.uuid === uuid);
  const base = summary?.baseCurrency ?? '';
  const runway = useMemo(() => {
    const live = summary?.balanceRunway ?? [];
    if (!import.meta.env.DEV || params.get('previewAlerts') !== '1') return live;
    return PREVIEW_RUNWAY;
  }, [summary?.balanceRunway, params]);

  const attention = buildAttentionGroups(t, {
    overdue: summary?.overdueBillings ?? [],
    upcoming: summary?.upcomingBillings ?? [],
    runway,
    topUps: summary?.balanceTopUps ?? [],
  });
  // Charges the balance won't cover but that are not critical yet (warning severity) stay out of
  // the attention table, yet the hero must not call them "covered".
  const uncovered = (summary?.upcomingBillings ?? []).filter(
    (b) => b.covered === false && b.severity !== 'critical',
  ).length;
  // Top-ups are the remedy for uncovered charges, not separate problems, so they don't count.
  const problems = [...attention.overdue, ...attention.uncovered, ...attention.runway];
  const attentionCount = problems.length + uncovered;
  const attentionState: InkState = problems.some((r) => r.state === 'failed')
    ? 'failed'
    : attentionCount > 0
      ? 'warn'
      : 'ok';

  // Completely empty panel (not a single provider): show a getting-started
  // invitation rather than all-zero cards.
  const isEmpty = !isLoading && summary != null && summary.byProvider.length === 0;
  // Both lists hide themselves when empty; skip their grid too so it leaves no gap behind.
  const hasBreakdown =
    (summary?.byType ?? []).some((r) => Number(r.monthlyCost) > 0) ||
    (summary?.byProject ?? []).some((p) => p.servicesCount > 0);
  const hasApiProviders = (providers ?? []).some((p) => p.kind !== 'manual');

  const doSyncAll = async () => {
    try {
      notifySyncAll(t, await syncAll.mutateAsync());
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('dashboard.title')}
        actions={
          // A sync-all may also be running from the palette or the providers page.
          <Button size="sm" disabled={activity.all || !hasApiProviders} onClick={doSyncAll}>
            {activity.all ? <InkGlyph state="progress" /> : <IconRefresh />}
            {t('dashboard.syncAll')}
          </Button>
        }
      />

      <DashboardHero
        summary={summary}
        base={base}
        attentionCount={attentionCount}
        attentionState={attentionState}
      />

      {isEmpty && (
        <Card className="items-center gap-3 px-6 py-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-background">
            <IconServer2 className="size-5 text-ink-3" stroke={1.5} />
          </div>
          <div>
            <p className="text-[15px] font-medium">{t('dashboard.empty.startTitle')}</p>
            <p className="mt-1 text-sm text-ink-2">{t('dashboard.empty.startText')}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link to="/providers">{t('dashboard.empty.startCta')}</Link>
          </Button>
        </Card>
      )}

      <AttentionCards groups={attention} />

      <UpcomingTable upcoming={summary?.upcomingBillings ?? []} />

      {!isEmpty && (
        <div className="grid gap-8 lg:grid-cols-2">
          <LastSyncCard providers={providers} />
          <SpendByMonthCard forecast={forecast} base={base} />
        </div>
      )}

      {hasBreakdown && (
        <div className="grid gap-8 lg:grid-cols-2">
          <ByTypeList byType={summary?.byType ?? []} base={base} />
          <ByProjectList byProject={summary?.byProject ?? []} base={base} projectOf={projectOf} />
        </div>
      )}

      <ByProviderCard
        providerRows={summary?.byProvider ?? []}
        base={base}
        providerOf={providerOf}
      />
    </div>
  );
}
