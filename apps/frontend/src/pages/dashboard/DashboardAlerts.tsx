import type { AnalyticsSummary } from '@infra/shared';
import { IconAlertTriangle, IconCash } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/ProviderIcon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  iconName,
  iconBg,
}: {
  name: string;
  kind?: string | null;
  faviconLink?: string | null;
  loginUrl?: string | null;
  iconName?: string | null;
  iconBg?: string | null;
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
        iconName={iconName}
        iconBg={iconBg}
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
  const kids = Array.from(row.children) as HTMLElement[];
  const prevRow = {
    flexWrap: row.style.flexWrap,
    width: row.style.width,
    maxWidth: row.style.maxWidth,
    minWidth: row.style.minWidth,
  };
  const prevKids = kids.map((k) => ({ flexShrink: k.style.flexShrink }));

  row.style.flexWrap = 'nowrap';
  row.style.width = 'max-content';
  row.style.maxWidth = 'none';
  row.style.minWidth = 'max-content';
  for (const k of kids) k.style.flexShrink = '0';

  const width = Math.ceil(row.getBoundingClientRect().width);

  row.style.flexWrap = prevRow.flexWrap;
  row.style.width = prevRow.width;
  row.style.maxWidth = prevRow.maxWidth;
  row.style.minWidth = prevRow.minWidth;
  kids.forEach((k, i) => {
    k.style.flexShrink = prevKids[i]?.flexShrink ?? '';
  });
  return width;
}

function rowIsWrapped(row: HTMLElement): boolean {
  const kids = Array.from(row.children) as HTMLElement[];
  if (kids.length < 2) return false;
  const top = kids[0].offsetTop;
  return kids.some((k) => Math.abs(k.offsetTop - top) > 1);
}

/** Equal 2-col grid while content fits on one line per half; otherwise stack. */
function EqualPairGrid({ deps, children }: { deps: unknown; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const stackRef = useRef(false);
  const [stack, setStack] = useState(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const measure = () => {
      const cards = Array.from(root.children) as HTMLElement[];
      if (cards.length < 2) {
        stackRef.current = true;
        setStack(true);
        return;
      }

      // Catch the awkward middle state: already wrapping inside a 2-col layout.
      if (
        !stackRef.current &&
        cards.some((card) =>
          Array.from(card.querySelectorAll<HTMLElement>('[data-alert-row]')).some(rowIsWrapped),
        )
      ) {
        stackRef.current = true;
        setStack(true);
        return;
      }

      const gap = Number.parseFloat(getComputedStyle(root).gap || '0') || 0;
      const half = (root.clientWidth - gap) / 2;
      if (half <= 0) {
        stackRef.current = true;
        setStack(true);
        return;
      }

      // Hysteresis: stack early, unstack only with spare room.
      const slack = stackRef.current ? 28 : 12;
      let needsStack = false;
      for (const card of cards) {
        const available = half - horizontalChrome(card) - slack;
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
      stackRef.current = needsStack;
      setStack(needsStack);
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
                    iconName={b.providerIconName}
                    iconBg={b.providerIconBg}
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
        <EqualPairGrid deps={pairKey}>
          {critical.length > 0 && (
            <Alert
              variant="destructive"
              className="h-full min-w-0 [&>[data-slot=alert-description]]:col-span-full [&>[data-slot=alert-description]]:col-start-1"
            >
              <IconAlertTriangle className="size-4" />
              <AlertTitle>{t('dashboard.critical.title')}</AlertTitle>
              <AlertDescription className="mt-1 w-full justify-items-stretch">
                <div className="w-full space-y-2">
                  {critical.map((b) => (
                    <div
                      key={b.serviceUuid}
                      data-alert-row
                      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
                    >
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
            <Alert className="h-full min-w-0 [&>[data-slot=alert-description]]:col-span-full [&>[data-slot=alert-description]]:col-start-1">
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
                        data-alert-row
                        className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm"
                      >
                        <span>{t('dashboard.critical.topUpLead')}</span>
                        <ProviderBadge
                          name={u.providerName}
                          kind={u.providerKind || fromCritical?.providerKind}
                          faviconLink={u.providerFaviconLink ?? fromCritical?.providerFaviconLink}
                          loginUrl={u.providerLoginUrl ?? fromCritical?.providerLoginUrl}
                          iconName={u.providerIconName ?? fromCritical?.providerIconName}
                          iconBg={u.providerIconBg ?? fromCritical?.providerIconBg}
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
        </EqualPairGrid>
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
