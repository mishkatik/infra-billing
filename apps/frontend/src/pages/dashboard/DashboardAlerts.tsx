import type { AnalyticsSummary } from '@infra/shared';
import { IconAlertTriangle, IconCash, IconClockHour4 } from '@tabler/icons-react';
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
  clusterIsWrapped,
  clusterOneLineWidth,
} from './dashboardAlertUi';
import { agoLabel, dayLabel, severityBadgeClass } from './dashboardUtils';
import { createLayoutGate } from './layoutMeasure';

type RunwayRow = AnalyticsSummary['balanceRunway'][number];

function RunwayChargeRows({ rows }: { rows: RunwayRow[] }) {
  const { t } = useTranslation();
  return (
    <AlertChargeGrid
      showBalance
      deps={rows.map((r) => `${r.providerUuid}:${r.daysLeft}:${r.balance}`).join('|')}
    >
      {rows.map((r, index) => (
        <AlertChargeRow
          key={r.providerUuid}
          index={index}
          who={
            <>
              <span>{t('dashboard.runway.providerLead')}</span>
              <ProviderBadge
                name={r.providerName}
                kind={r.providerKind}
                faviconLink={r.providerFaviconLink}
                loginUrl={r.providerLoginUrl}
                iconName={r.providerIconName}
                iconBg={r.providerIconBg}
              />
            </>
          }
          balance={
            <span className="text-muted-foreground tabular-nums">
              {t('dashboard.runway.perDay', {
                amount: formatMoney(r.burnPerDay, r.currency),
              })}
            </span>
          }
          badge={
            <Badge className={cn('capitalize', severityBadgeClass(r.severity))}>
              {dayLabel(t, r.daysLeft)}
            </Badge>
          }
          amount={formatMoney(r.balance, r.currency)}
        />
      ))}
    </AlertChargeGrid>
  );
}

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

/** Padding/border + optional leading icon track stolen from the content column. */
function alertContentInset(card: HTMLElement): number {
  const alert = card.querySelector<HTMLElement>('[data-slot="alert"]') ?? card;
  let inset = horizontalChrome(alert);
  const icon = alert.querySelector<HTMLElement>(':scope > svg');
  if (icon) {
    const gap =
      Number.parseFloat(getComputedStyle(alert).columnGap || getComputedStyle(alert).gap || '0') ||
      0;
    inset += Math.ceil(icon.getBoundingClientRect().width) + gap;
  }
  return inset;
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
      (grid && getComputedStyle(grid).columnGap) || (grid && getComputedStyle(grid).gap) || '0',
    ) || 0;
  if (who) {
    const leaderMin = leader
      ? Number.parseFloat(getComputedStyle(leader).minWidth || '0') || 12
      : 0;
    const metaWidth = metas.reduce((sum, m) => sum + Math.ceil(m.scrollWidth), 0);
    // who + leader sit in the first grid cell (one internal gap), then meta columns.
    return clusterOneLineWidth(who) + gap + leaderMin + metaWidth + gap * Math.max(metas.length, 0);
  }
  return metas.reduce((sum, m) => sum + Math.ceil(m.scrollWidth), 0);
}

function cardOverflowsHalf(
  card: HTMLElement,
  half: number,
  slack: number,
  checkLiveWrap: boolean,
): boolean {
  if (checkLiveWrap) {
    for (const who of card.querySelectorAll<HTMLElement>('[data-alert-who]')) {
      if (clusterIsWrapped(who)) return true;
    }
  }
  const available = Math.floor(half - alertContentInset(card) - slack);
  const title = card.querySelector<HTMLElement>('[data-slot="alert-title"]');
  if (title && titleOneLineWidth(title) > available) return true;
  for (const row of card.querySelectorAll<HTMLElement>('[data-alert-row]')) {
    if (rowOneLineWidth(row) > available) return true;
  }
  return false;
}

/**
 * Two side-by-side pairs while content fits. When stacked, criticals are grouped first:
 * charge-critical → runway-critical → top-up → balance-runway.
 */
function AlertPairsLayout({
  deps,
  chargeCritical,
  topUp,
  runwayCritical,
  runway,
}: {
  deps: unknown;
  chargeCritical: ReactNode | null;
  topUp: ReactNode | null;
  runwayCritical: ReactNode | null;
  runway: ReactNode | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stackRef = useRef(false);
  const [stack, setStack] = useState(false);

  useLayoutEffect(() => {
    void deps;
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
      const gap = Number.parseFloat(getComputedStyle(root).gap || '0') || 16;
      const half = (root.clientWidth - gap) / 2;
      if (half <= 0) {
        applyStack(true);
        return;
      }

      const pairs = new Map<string, HTMLElement[]>();
      for (const card of root.querySelectorAll<HTMLElement>('[data-alert-card]')) {
        const pair = card.dataset.alertPair;
        if (!pair) continue;
        const list = pairs.get(pair) ?? [];
        list.push(card);
        pairs.set(pair, list);
      }

      // Only pairs with two cards can force a stack; a lone card is already full-width.
      const paired = [...pairs.values()].filter((cards) => cards.length >= 2);
      if (paired.length === 0) {
        applyStack(false);
        return;
      }

      // Stack before who badges wrap. Live wrap is a safety net while side-by-side.
      // Hysteresis: stack early, unstack only with spare room.
      const slack = stackRef.current ? 64 : 12;
      const checkLiveWrap = !stackRef.current;
      const needsStack = paired.some((cards) =>
        cards.some((card) => cardOverflowsHalf(card, half, slack, checkLiveWrap)),
      );
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

  const wrap = (pair: string, node: ReactNode | null) =>
    node == null ? null : (
      <div data-alert-card="" data-alert-pair={pair} className="min-w-0 h-full">
        {node}
      </div>
    );

  const chargeCriticalCard = wrap('charge', chargeCritical);
  const topUpCard = wrap('charge', topUp);
  const runwayCriticalCard = wrap('runway', runwayCritical);
  const runwayCard = wrap('runway', runway);

  if (stack) {
    return (
      <div ref={ref} className="grid grid-cols-1 gap-4">
        {chargeCriticalCard}
        {runwayCriticalCard}
        {topUpCard}
        {runwayCard}
      </div>
    );
  }

  return (
    <div ref={ref} className="grid gap-4">
      {(chargeCriticalCard || topUpCard) && (
        <div
          className={cn(
            'grid items-stretch gap-4',
            chargeCriticalCard && topUpCard ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {chargeCriticalCard}
          {topUpCard}
        </div>
      )}
      {(runwayCriticalCard || runwayCard) && (
        <div
          className={cn(
            'grid items-stretch gap-4',
            runwayCriticalCard && runwayCard ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {runwayCriticalCard}
          {runwayCard}
        </div>
      )}
    </div>
  );
}

// Alert lays out as [icon | content], and the description defaults to the content column. Span it
// across both tracks so the charge rows start at the card's left edge instead of under the title.
const fullWidthRowsClass =
  '[&>[data-slot=alert-description]]:col-span-full [&>[data-slot=alert-description]]:col-start-1';

const pairAlertClass = cn('h-full min-w-0', fullWidthRowsClass);

export function DashboardAlerts({ overdue, upcoming, runway, topUps }: DashboardAlertsProps) {
  const { t } = useTranslation();
  const critical = upcoming.filter((b) => b.severity === 'critical');
  const runwayCritical = runway.filter((r) => r.severity === 'critical');
  // Warning-only companion to the critical runway alert (same dataset, no duplicated rows).
  const runwayWarning = runway.filter((r) => r.severity === 'warning');
  const criticalTopUps = topUps.filter((u) =>
    critical.some((b) => b.providerUuid === u.providerUuid),
  );
  const pairsKey = `${critical.map((b) => `${b.serviceUuid}:${b.name}:${b.cost}:${b.providerName}`).join('|')}:${criticalTopUps.map((u) => `${u.providerUuid}:${u.amount}:${u.providerName}`).join('|')}:${runwayCritical.map((r) => `${r.providerUuid}:${r.daysLeft}:${r.balance}`).join('|')}:${runwayWarning.map((r) => `${r.providerUuid}:${r.severity}:${r.daysLeft}`).join('|')}:${t('dashboard.critical.title')}`;

  const chargeCriticalAlert =
    critical.length > 0 ? (
      <Alert variant="destructive" className={pairAlertClass}>
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
                    <ServiceBadge
                      name={b.name}
                      type={b.type}
                      countryCode={b.countryCode}
                      marker={b.marker}
                      markerBg={b.markerBg}
                      vendor={b.vendor}
                    />
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
    ) : null;

  const topUpAlert =
    criticalTopUps.length > 0 ? (
      <Alert className={pairAlertClass}>
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
                        faviconLink={u.providerFaviconLink ?? fromCritical?.providerFaviconLink}
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
    ) : null;

  const runwayCriticalAlert =
    runwayCritical.length > 0 ? (
      <Alert variant="destructive" className={pairAlertClass}>
        <IconAlertTriangle className="size-4" />
        <AlertTitle>{t('dashboard.runway.criticalTitle')}</AlertTitle>
        <AlertDescription className="mt-2 block w-full">
          <RunwayChargeRows rows={runwayCritical} />
        </AlertDescription>
      </Alert>
    ) : null;

  const runwayAlert =
    runwayWarning.length > 0 ? (
      <Alert className={pairAlertClass}>
        <IconClockHour4 className="size-4" />
        <AlertTitle>{t('dashboard.runway.title')}</AlertTitle>
        <AlertDescription className="mt-2 block w-full">
          <RunwayChargeRows rows={runwayWarning} />
        </AlertDescription>
      </Alert>
    ) : null;

  const hasPairs =
    chargeCriticalAlert != null ||
    topUpAlert != null ||
    runwayCriticalAlert != null ||
    runwayAlert != null;

  return (
    <>
      {overdue.length > 0 && (
        <Alert variant="destructive" className={fullWidthRowsClass}>
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
                      <ServiceBadge
                        name={b.name}
                        type={b.type}
                        countryCode={b.countryCode}
                        marker={b.marker}
                        markerBg={b.markerBg}
                        vendor={b.vendor}
                      />
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

      {hasPairs && (
        <AlertPairsLayout
          deps={pairsKey}
          chargeCritical={chargeCriticalAlert}
          topUp={topUpAlert}
          runwayCritical={runwayCriticalAlert}
          runway={runwayAlert}
        />
      )}
    </>
  );
}
