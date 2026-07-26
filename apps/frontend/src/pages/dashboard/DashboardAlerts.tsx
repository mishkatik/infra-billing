import type { AnalyticsSummary } from '@infra/shared';
import { IconAlertTriangle, IconCash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/ProviderIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { providerFavicon } from '@/utils/favicon';
import { countryFlag, formatDateShort, formatMoney } from '@/utils/format';
import { countryBadgeStyle, providerBadgeStyle } from './badgeTints';
import { agoLabel, dayLabel } from './dashboardUtils';

interface DashboardAlertsProps {
  overdue: AnalyticsSummary['overdueBillings'];
  upcoming: AnalyticsSummary['upcomingBillings'];
  runway: AnalyticsSummary['balanceRunway'];
  topUps: AnalyticsSummary['balanceTopUps'];
}

function ProviderBadge({
  name,
  kind,
  faviconLink,
  loginUrl,
}: {
  name: string;
  kind?: string | null;
  faviconLink?: string | null;
  loginUrl?: string | null;
}) {
  const tint = providerBadgeStyle(kind);
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border py-0.5 pr-2 pl-1 font-normal shadow-none"
      style={tint}
    >
      <ProviderIcon
        name={name}
        src={providerFavicon({ faviconLink: faviconLink ?? null, loginUrl: loginUrl ?? null })}
        size={16}
      />
      <span style={{ color: tint.color }}>{name}</span>
    </Badge>
  );
}

function ServiceBadge({ countryCode, name }: { countryCode?: string | null; name: string }) {
  const flag = countryFlag(countryCode);
  return (
    <Badge
      variant="outline"
      className="gap-1 border font-medium"
      style={countryBadgeStyle(countryCode)}
    >
      {flag ? <span className="text-sm leading-none">{flag}</span> : null}
      {name}
    </Badge>
  );
}

// Red banners for overdue charges, imminent unaffordable charges and draining prepaid balances.
export function DashboardAlerts({ overdue, upcoming, runway, topUps }: DashboardAlertsProps) {
  const { t } = useTranslation();
  const critical = upcoming.filter((b) => b.severity === 'critical');
  const runwayCritical = runway.filter((r) => r.severity === 'critical');
  const criticalTopUps = topUps.filter((u) =>
    critical.some((b) => b.providerUuid === u.providerUuid),
  );
  return (
    <>
      {overdue.length > 0 && (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertTitle>{t('dashboard.overdue.title')}</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              {overdue.map((b) => (
                <div
                  key={b.serviceUuid}
                  className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
                >
                  <span>{t('dashboard.critical.serviceLead')}</span>
                  <ProviderBadge
                    name={b.providerName}
                    kind={b.providerKind}
                    faviconLink={b.providerFaviconLink}
                    loginUrl={b.providerLoginUrl}
                  />
                  <ServiceBadge countryCode={b.countryCode} name={b.name} />
                  <span>
                    {t('dashboard.overdue.charge', {
                      when: agoLabel(t, b.daysOverdue),
                      date: formatDateShort(b.nextBillingAt),
                      amount: formatMoney(b.cost, b.currency),
                    })}
                  </span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {(critical.length > 0 || criticalTopUps.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
          {critical.length > 0 && (
            <Alert
              variant="destructive"
              className="h-full [&>[data-slot=alert-description]]:col-span-full [&>[data-slot=alert-description]]:col-start-1"
            >
              <IconAlertTriangle className="size-4" />
              <AlertTitle>{t('dashboard.critical.title')}</AlertTitle>
              <AlertDescription className="mt-1 w-full justify-items-stretch">
                <div className="w-full space-y-2">
                  {critical.map((b) => (
                    <div
                      key={b.serviceUuid}
                      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
                    >
                      <span>{t('dashboard.critical.serviceLead')}</span>
                      <ProviderBadge
                        name={b.providerName}
                        kind={b.providerKind}
                        faviconLink={b.providerFaviconLink}
                        loginUrl={b.providerLoginUrl}
                      />
                      <ServiceBadge countryCode={b.countryCode} name={b.name} />
                      <span>
                        {t('dashboard.critical.charge', {
                          when: dayLabel(t, b.daysUntil),
                          amount: formatMoney(b.cost, b.currency),
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {criticalTopUps.length > 0 && (
            <Alert className="h-full [&>[data-slot=alert-description]]:col-span-full [&>[data-slot=alert-description]]:col-start-1">
              <IconCash className="size-4" />
              <AlertTitle>{t('dashboard.critical.topUpTitle')}</AlertTitle>
              <AlertDescription className="mt-1 w-full justify-items-stretch">
                <div className="flex w-full flex-col gap-2">
                  {criticalTopUps.map((u) => {
                    const fromCritical = critical.find((b) => b.providerUuid === u.providerUuid);
                    const soonest = critical
                      .filter((b) => b.providerUuid === u.providerUuid)
                      .reduce(
                        (best, b) => (best == null || b.daysUntil < best.daysUntil ? b : best),
                        null as (typeof critical)[number] | null,
                      );
                    return (
                      <div
                        key={u.providerUuid}
                        className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
                      >
                        <span>{t('dashboard.critical.topUpLead')}</span>
                        <ProviderBadge
                          name={u.providerName}
                          kind={u.providerKind || fromCritical?.providerKind}
                          faviconLink={u.providerFaviconLink ?? fromCritical?.providerFaviconLink}
                          loginUrl={u.providerLoginUrl ?? fromCritical?.providerLoginUrl}
                        />
                        <span>
                          {t('dashboard.critical.topUp', {
                            amount: formatMoney(u.amount, u.currency),
                            when: dayLabel(t, soonest?.daysUntil ?? 0),
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
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
