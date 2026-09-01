import type { AnalyticsSummary } from '@infra/shared';
import { IconCalendarEvent } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDateShort, formatMoney } from '@/utils/format';
import {
  AlertChargeGrid,
  AlertChargeRow,
  CoverageBadge,
  ProviderBadge,
  ServiceBadge,
} from './dashboardAlertUi';
import { dayLabel, severityBadgeClass } from './dashboardUtils';

interface UpcomingBillingsCardProps {
  upcoming: AnalyticsSummary['upcomingBillings'];
}

export function UpcomingBillingsCard({ upcoming }: UpcomingBillingsCardProps) {
  const { t } = useTranslation();
  if (upcoming.length === 0) return null;

  return (
    <Alert className="[&>[data-slot=alert-description]]:col-span-full [&>[data-slot=alert-description]]:col-start-1">
      <IconCalendarEvent className="size-4" />
      <AlertTitle>{t('dashboard.upcoming.title')}</AlertTitle>
      <AlertDescription className="mt-2 block w-full">
        <AlertChargeGrid
          showDate
          showBalance
          collapseDateWhenTight
          deps={upcoming
            .map((ub) => `${ub.serviceUuid}:${ub.name}:${ub.providerName}:${ub.nextBillingAt}`)
            .join('|')}
        >
          {upcoming.map((ub, index) => (
            <AlertChargeRow
              key={ub.serviceUuid}
              index={index}
              who={
                <>
                  <span>{t('dashboard.critical.serviceLead')}</span>
                  <ProviderBadge
                    name={ub.providerName}
                    kind={ub.providerKind}
                    uuid={ub.providerUuid}
                    faviconLink={ub.providerFaviconLink}
                    loginUrl={ub.providerLoginUrl}
                    iconName={ub.providerIconName}
                    iconBg={ub.providerIconBg}
                  />
                  <ServiceBadge
                    name={ub.name}
                    uuid={ub.serviceUuid}
                    type={ub.type}
                    countryCode={ub.countryCode}
                    marker={ub.marker}
                    markerBg={ub.markerBg}
                    vendor={ub.vendor}
                  />
                </>
              }
              balance={<CoverageBadge covered={ub.covered} />}
              badge={
                <Badge className={cn('capitalize', severityBadgeClass(ub.severity))}>
                  {dayLabel(t, ub.daysUntil)}
                </Badge>
              }
              date={
                <span className="font-normal text-muted-foreground tabular-nums">
                  {formatDateShort(ub.nextBillingAt)}
                </span>
              }
              amount={formatMoney(ub.cost, ub.currency)}
            />
          ))}
        </AlertChargeGrid>
      </AlertDescription>
    </Alert>
  );
}
