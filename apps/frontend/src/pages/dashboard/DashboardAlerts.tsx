import type { AnalyticsSummary } from '@infra/shared';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateShort, formatMoney } from '@/utils/format';
import { agoLabel, dayLabel } from './dashboardUtils';

interface DashboardAlertsProps {
  overdue: AnalyticsSummary['overdueBillings'];
  upcoming: AnalyticsSummary['upcomingBillings'];
  runway: AnalyticsSummary['balanceRunway'];
}

// Red banners for overdue charges, imminent unaffordable charges and draining prepaid balances.
export function DashboardAlerts({ overdue, upcoming, runway }: DashboardAlertsProps) {
  const { t } = useTranslation();
  const critical = upcoming.filter((b) => b.severity === 'critical');
  const runwayCritical = runway.filter((r) => r.severity === 'critical');
  return (
    <>
      {overdue.length > 0 && (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertTitle>{t('dashboard.overdue.title')}</AlertTitle>
          <AlertDescription>
            <div className="space-y-1">
              {overdue.map((b) => (
                <p key={b.serviceUuid} className="text-sm">
                  <b>
                    {b.providerName} — {b.name}
                  </b>
                  :{' '}
                  {t('dashboard.overdue.charge', {
                    when: agoLabel(t, b.daysOverdue),
                    date: formatDateShort(b.nextBillingAt),
                    amount: formatMoney(b.cost, b.currency),
                  })}
                </p>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {critical.length > 0 && (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertTitle>{t('dashboard.critical.title')}</AlertTitle>
          <AlertDescription>
            <div className="space-y-1">
              {critical.map((b) => (
                <p key={b.serviceUuid} className="text-sm">
                  <b>
                    {b.providerName} — {b.name}
                  </b>
                  :{' '}
                  {t('dashboard.critical.charge', {
                    when: dayLabel(t, b.daysUntil),
                    amount: formatMoney(b.cost, b.currency),
                  })}
                  {b.providerBalance != null &&
                    t('dashboard.critical.balance', {
                      amount: formatMoney(b.providerBalance, b.providerBalanceCurrency),
                    })}
                </p>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {runwayCritical.length > 0 && (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertTitle>{t('dashboard.runway.criticalTitle')}</AlertTitle>
          <AlertDescription>
            <div className="space-y-1">
              {runwayCritical.map((r) => (
                <p key={r.providerUuid} className="text-sm">
                  <b>{r.providerName}</b>:{' '}
                  {t('dashboard.runway.runsOut', { when: dayLabel(t, r.daysLeft) })} ·{' '}
                  {t('dashboard.runway.perDay', { amount: formatMoney(r.burnPerDay, r.currency) })}
                  {t('dashboard.runway.balance', { amount: formatMoney(r.balance, r.currency) })}
                </p>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
