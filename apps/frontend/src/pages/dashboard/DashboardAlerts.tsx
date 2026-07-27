import type { AnalyticsSummary } from '@infra/shared';
import { IconAlertTriangle, IconCash } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import {
  AlertChargeGrid,
  AlertChargeRow,
  ProviderBadge,
  ServiceBadge,
  clusterOneLineWidth,
} from './dashboardAlertUi';
import { agoLabel, dayLabel, severityBadgeClass } from './dashboardUtils';
import { createLayoutGate } from './layoutMeasure';

interface DashboardAlertsProps {
  overdue: AnalyticsSummary['overdueBillings'];
  upcoming: AnalyticsSummary['upcomingBillings'];
  runway: AnalyticsSummary['balanceRunway'];
  topUps: AnalyticsSummary['balanceTopUps'];
}

function horizontalChrome(el: HTMLElement): number {
  const s = getComputedStyle(el);
  return (
    Number.parseFloat(s.paddingLeft) +
    Number.parseFloat(s.paddingRight) +
    Number.parseFloat(s.borderLeftWidth) +
    Number.parseFloat(s.borderRightWidth)
  );
}

function titleOneLineWidth(el: HTMLElement): number {
  const prev = {
    whiteSpace: el.style.whiteSpace,
    width: el.style.width,
    maxWidth: el.style.maxWidth,
    overflow: el.style.overflow,
    display: el.style.display,
  };
  el.style.whiteSpace = 'nowrap';
  el.style.width = 'max-content';
  el.style.maxWidth = 'none';
  el.style.overflow = 'visible';
  el.style.display = 'inline-block';
  const width = Math.ceil(el.getBoundingClientRect().width);
  el.style.whiteSpace = prev.whiteSpace;
  el.style.width = prev.width;
  el.style.maxWidth = prev.maxWidth;
  el.style.overflow = prev.overflow;
  el.style.display = prev.display;
  return width;
}

function rowOneLineWidth(row: HTMLElement): number {
  const who = row.querySelector<HTMLElement>('[data-alert-who]');
  const leader = row.querySelector<HTMLElement>('[data-alert-leader]');
  const metas = Array.from(row.querySelectorAll<HTMLElement>('[data-alert-meta]'));
  const grid = row.parentElement;
  const gap =
    Number.parseFloat(
      (grid && getComputedStyle(grid).columnGap) ||
        (grid && getComputedStyle(grid).gap) ||
        '0',
    ) || 0;
  if (who) {
    const leaderMin = leader
      ? Number.parseFloat(getComputedStyle(leader).minWidth || '0') || 12
      : 0;
    const metaWidth = metas.reduce((sum, m) => sum + Math.ceil(m.scrollWidth), 0);
    // who + leader sit in the first grid cell (one internal gap), then meta columns.
    return (
      clusterOneLineWidth(who) +
      gap +
      leaderMin +
      metaWidth +
      gap * Math.max(metas.length, 0)
    );
  }
  return metas.reduce((sum, m) => sum + Math.ceil(m.scrollWidth), 0);
}

/** Equal 2-col grid while content fits on one line per half; otherwise stack. */
function EqualPairGrid({ deps, children }: { deps: unknown; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const stackRef = useRef(false);
  const [stack, setStack] = useState(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const gate = createLayoutGate();

    const applyStack = (next: boolean) => {
      if (stackRef.current === next) return;
      stackRef.current = next;
      gate.afterChange();
      setStack(next);
    };

    const measure = () => {
      if (gate.shouldSkip()) return;
      const cards = Array.from(root.children) as HTMLElement[];
      if (cards.length < 2) {
        applyStack(true);
        return;
      }

      const gap = Number.parseFloat(getComputedStyle(root).gap || '0') || 0;
      const half = (root.clientWidth - gap) / 2;
      if (half <= 0) {
        applyStack(true);
        return;
      }

      // Width-only decision: live wrap + remasure disagreed under deep browser zoom.
      // Hysteresis: stack early, unstack only with spare room.
      const slack = stackRef.current ? 64 : 12;
      let needsStack = false;
      for (const card of cards) {
        const available = Math.floor(half - horizontalChrome(card) - slack);
        const title = card.querySelector<HTMLElement>('[data-slot="alert-title"]');
        if (title && titleOneLineWidth(title) > available) {
          needsStack = true;
          break;
        }
        for (const row of card.querySelectorAll<HTMLElement>('[data-alert-row]')) {
          if (rowOneLineWidth(row) > available) {
            needsStack = true;
            break;
          }
        }
        if (needsStack) break;
      }
      applyStack(needsStack);
    };

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [deps]);

  return (
    <div
      ref={ref}
      className={cn('grid items-stretch gap-4', stack ? 'grid-cols-1' : 'grid-cols-2')}
    >
      {children}
    </div>
  );
}

export function DashboardAlerts({ overdue, upcoming, runway, topUps }: DashboardAlertsProps) {
  const { t } = useTranslation();
  const critical = upcoming.filter((b) => b.severity === 'critical');
  const runwayCritical = runway.filter((r) => r.severity === 'critical');
  const criticalTopUps = topUps.filter((u) =>
    critical.some((b) => b.providerUuid === u.providerUuid),
  );
  const pairKey = `${critical.map((b) => `${b.serviceUuid}:${b.name}:${b.cost}:${b.providerName}`).join('|')}:${criticalTopUps.map((u) => `${u.providerUuid}:${u.amount}:${u.providerName}`).join('|')}:${t('dashboard.critical.title')}`;

  return (
    <>
      {overdue.length > 0 && (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertTitle>{t('dashboard.overdue.title')}</AlertTitle>
          <AlertDescription className="mt-2 block w-full">
            <AlertChargeGrid>
              {overdue.map((b, index) => (
                <AlertChargeRow
                  key={b.serviceUuid}
                  index={index}
                  who={
                    <>
                      <span>{t('dashboard.critical.serviceLead')}</span>
                      <ProviderBadge
                        name={b.providerName}
                        kind={b.providerKind}
                        faviconLink={b.providerFaviconLink}
                        loginUrl={b.providerLoginUrl}
                        iconName={b.providerIconName}
                        iconBg={b.providerIconBg}
                      />
                      <ServiceBadge countryCode={b.countryCode} name={b.name} />
                    </>
                  }
                  badge={
                    <Badge className={cn('capitalize', severityBadgeClass('critical'))}>
                      {agoLabel(t, b.daysOverdue)}
                    </Badge>
                  }
                  amount={formatMoney(b.cost, b.currency)}
                />
              ))}
            </AlertChargeGrid>
          </AlertDescription>
        </Alert>
      )}

      {(critical.length > 0 || criticalTopUps.length > 0) && (
        <EqualPairGrid deps={pairKey}>
          {critical.length > 0 && (
            <Alert
              variant="destructive"
              className="h-full min-w-0 [&>[data-slot=alert-description]]:col-span-full [&>[data-slot=alert-description]]:col-start-1"
            >
              <IconAlertTriangle className="size-4" />
              <AlertTitle>{t('dashboard.critical.title')}</AlertTitle>
              <AlertDescription className="mt-2 block w-full">
                <AlertChargeGrid>
                  {critical.map((b, index) => (
                    <AlertChargeRow
                      key={b.serviceUuid}
                      index={index}
                      who={
                        <>
                          <span>{t('dashboard.critical.serviceLead')}</span>
                          <ProviderBadge
                            name={b.providerName}
                            kind={b.providerKind}
                            faviconLink={b.providerFaviconLink}
                            loginUrl={b.providerLoginUrl}
                            iconName={b.providerIconName}
                            iconBg={b.providerIconBg}
                          />
                          <ServiceBadge countryCode={b.countryCode} name={b.name} />
                        </>
                      }
                      badge={
                        <Badge className={cn('capitalize', severityBadgeClass(b.severity))}>
                          {dayLabel(t, b.daysUntil)}
                        </Badge>
                      }
                      amount={formatMoney(b.cost, b.currency)}
                    />
                  ))}
                </AlertChargeGrid>
              </AlertDescription>
            </Alert>
          )}

          {criticalTopUps.length > 0 && (
            <Alert className="h-full min-w-0 [&>[data-slot=alert-description]]:col-span-full [&>[data-slot=alert-description]]:col-start-1">
              <IconCash className="size-4" />
              <AlertTitle>{t('dashboard.critical.topUpTitle')}</AlertTitle>
              <AlertDescription className="mt-2 block w-full">
                <AlertChargeGrid>
                  {criticalTopUps.map((u, index) => {
                    const fromCritical = critical.find((b) => b.providerUuid === u.providerUuid);
                    const soonest = critical
                      .filter((b) => b.providerUuid === u.providerUuid)
                      .reduce(
                        (best, b) => (best == null || b.daysUntil < best.daysUntil ? b : best),
                        null as (typeof critical)[number] | null,
                      );
                    return (
                      <AlertChargeRow
                        key={u.providerUuid}
                        index={index}
                        who={
                          <>
                            <span>{t('dashboard.critical.topUpLead')}</span>
                            <ProviderBadge
                              name={u.providerName}
                              kind={u.providerKind || fromCritical?.providerKind}
                              faviconLink={
                                u.providerFaviconLink ?? fromCritical?.providerFaviconLink
                              }
                              loginUrl={u.providerLoginUrl ?? fromCritical?.providerLoginUrl}
                              iconName={u.providerIconName ?? fromCritical?.providerIconName}
                              iconBg={u.providerIconBg ?? fromCritical?.providerIconBg}
                            />
                          </>
                        }
                        badge={
                          <Badge
                            className={cn(
                              'capitalize',
                              severityBadgeClass(soonest?.severity ?? 'critical'),
                            )}
                          >
                            {dayLabel(t, soonest?.daysUntil ?? 0)}
                          </Badge>
                        }
                        amount={formatMoney(u.amount, u.currency)}
                      />
                    );
                  })}
                </AlertChargeGrid>
              </AlertDescription>
            </Alert>
          )}
        </EqualPairGrid>
      )}

      {runwayCritical.length > 0 && (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertTitle>{t('dashboard.runway.criticalTitle')}</AlertTitle>
          <AlertDescription className="mt-2">
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
