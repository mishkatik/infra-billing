import { IconServer2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useForecast, useSummary } from '@/api/analytics';
import { useProjects } from '@/api/projects';
import { useProviders } from '@/api/providers';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { projectFavicon } from '@/utils/favicon';
import { ByProjectCard } from './ByProjectCard';
import { ByProviderCard } from './ByProviderCard';
import { DashboardAlerts } from './DashboardAlerts';
import { ForecastCard } from './ForecastCard';
import { KpiCards } from './KpiCards';
import { RunwayCard } from './RunwayCard';
import { SpendByTypeCard } from './SpendByTypeCard';
import { UpcomingBillingsCard } from './UpcomingBillingsCard';

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: summary, isLoading } = useSummary();
  const { data: forecast } = useForecast(6, 3);
  const { data: providers } = useProviders();
  const { data: projectsList } = useProjects();
  const providerOf = (uuid: string) => providers?.find((p) => p.uuid === uuid);
  const projectIconOf = (uuid: string) =>
    projectFavicon(projectsList?.find((p) => p.uuid === uuid)?.faviconLink ?? null);
  const base = summary?.baseCurrency ?? '';

  // Completely empty panel (not a single provider): show a getting-started
  // invitation rather than all-zero cards.
  const isEmpty = !isLoading && summary != null && summary.byProvider.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

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
        runway={summary?.balanceRunway ?? []}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SpendByTypeCard byType={summary?.byType ?? []} base={base} isLoading={isLoading} />
        <ForecastCard forecast={forecast} base={base} />
      </div>

      <ByProjectCard
        projectRows={summary?.byProject ?? []}
        base={base}
        isLoading={isLoading}
        projectIconOf={projectIconOf}
      />

      <ByProviderCard
        providerRows={summary?.byProvider ?? []}
        base={base}
        isLoading={isLoading}
        providerOf={providerOf}
      />

      <UpcomingBillingsCard upcoming={summary?.upcomingBillings ?? []} />

      <RunwayCard runway={summary?.balanceRunway ?? []} />
    </div>
  );
}
