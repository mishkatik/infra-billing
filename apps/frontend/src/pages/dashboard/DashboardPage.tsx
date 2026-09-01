import type { AnalyticsSummary } from '@infra/shared';
import { IconServer2 } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useForecast, useSummary } from '@/api/analytics';
import { useMe } from '@/api/auth';
import { useProjects } from '@/api/projects';
import { useProviders } from '@/api/providers';
import { can } from '@/auth/permissions';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ByProjectCard } from './ByProjectCard';
import { ByProviderCard } from './ByProviderCard';
import { DashboardAlerts } from './DashboardAlerts';
import { ForecastCard } from './ForecastCard';
import { KpiCards } from './KpiCards';
import { ProjectFilter } from './ProjectFilter';
import { SpendByTypeCard } from './SpendByTypeCard';
import { UpcomingBillingsCard } from './UpcomingBillingsCard';

/** Dev-only sample runway rows so badge redesign can be previewed without live low balances. */
const PREVIEW_RUNWAY: AnalyticsSummary['balanceRunway'] = [
  {
    providerUuid: '00000000-0000-0000-0000-000000000101',
    providerName: 'selectel.ru',
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
    providerName: 'timeweb.cloud',
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
  const [params, setParams] = useSearchParams();
  const selectedProjects = useMemo(
    () => params.get('projects')?.split(',').filter(Boolean) ?? [],
    [params],
  );
  const setSelectedProjects = (next: string[]) => {
    const p = new URLSearchParams(params);
    if (next.length) p.set('projects', next.join(','));
    else p.delete('projects');
    setParams(p, { replace: true });
  };
  const me = useMe();
  const { data: summary, isLoading } = useSummary(selectedProjects);
  const { data: forecast } = useForecast(6, 3, selectedProjects);
  const { data: providers } = useProviders({ enabled: can(me.data, 'providers:read') });
  const { data: projectsList } = useProjects();
  const providerOf = (uuid: string) => providers?.find((p) => p.uuid === uuid);
  const projectOf = (uuid: string) => projectsList?.find((p) => p.uuid === uuid);
  const base = summary?.baseCurrency ?? '';
  const runway = useMemo(() => {
    const live = summary?.balanceRunway ?? [];
    if (!import.meta.env.DEV || params.get('previewAlerts') !== '1') return live;
    return PREVIEW_RUNWAY;
  }, [summary?.balanceRunway, params]);

  // Completely empty panel (not a single provider): show a getting-started
  // invitation rather than all-zero cards.
  const isEmpty = !isLoading && summary != null && summary.byProvider.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
        <ProjectFilter
          options={(projectsList ?? []).map((p) => ({ value: p.uuid, label: p.name }))}
          selected={selectedProjects}
          onChange={setSelectedProjects}
        />
      </div>

      <KpiCards summary={summary} base={base} />

      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <IconServer2 className="size-5" />
            </div>
            <div>
              <p className="font-semibold">{t('dashboard.empty.startTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('dashboard.empty.startText')}</p>
            </div>
            <Button asChild className="mt-1">
              <Link to="/providers">{t('dashboard.empty.startCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <DashboardAlerts
        overdue={summary?.overdueBillings ?? []}
        upcoming={summary?.upcomingBillings ?? []}
        runway={runway}
        topUps={summary?.balanceTopUps ?? []}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SpendByTypeCard byType={summary?.byType ?? []} base={base} isLoading={isLoading} />
        <ForecastCard forecast={forecast} base={base} />
      </div>

      <ByProjectCard
        projectRows={summary?.byProject ?? []}
        base={base}
        isLoading={isLoading}
        projectOf={projectOf}
      />

      <ByProviderCard
        providerRows={summary?.byProvider ?? []}
        base={base}
        isLoading={isLoading}
        providerOf={providerOf}
      />

      <UpcomingBillingsCard upcoming={summary?.upcomingBillings ?? []} />
    </div>
  );
}
