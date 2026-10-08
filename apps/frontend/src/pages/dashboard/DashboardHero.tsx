import type { AnalyticsSummary } from '@infra/shared';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { InkGlyph, type InkState } from '@/components/ink/InkGlyph';
import { Card } from '@/components/ui/card';
import { formatMoney, formatMoneyRound } from '@/utils/format';
import { roundMoney, sumMoney } from '@/utils/money';
import { byDaysUntil, coverageLabel, upcomingState, withAccount } from './dashboardUtils';

const NEXT_CHARGES = 4;

interface DashboardHeroProps {
  summary: AnalyticsSummary | undefined;
  base: string;
  attentionCount: number;
  attentionState: InkState;
}

export function DashboardHero({
  summary,
  base,
  attentionCount,
  attentionState,
}: DashboardHeroProps) {
  const { t } = useTranslation();
  const upcoming = [...(summary?.upcomingBillings ?? [])].sort(byDaysUntil);
  const shown = upcoming.slice(0, NEXT_CHARGES);
  const shownCosts = shown.map((b) => roundMoney(b.costBase));
  // Rows show what will actually be charged, in the service's own currency; the total can only
  // add them up in the base currency, so it is marked approximate when a row had to be converted.
  const converted = shown.some((b) => b.currency !== base);
  const monthly = summary?.monthlyTotal ?? '0';

  const kpis = [
    { key: 'monthly', label: t('dashboard.kpi.monthly'), value: monthly },
    {
      key: 'yearly',
      label: t('dashboard.kpi.yearly'),
      value: summary?.yearlyProjection ?? '0',
    },
    {
      key: 'paid',
      label: t('dashboard.kpi.currentMonthPayments'),
      value: summary?.currentMonthPayments ?? '0',
    },
    { key: 'spent', label: t('dashboard.kpi.totalSpent'), value: summary?.totalSpent ?? '0' },
  ];

  return (
    <Card className="gap-0 p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* A column flex so the figure can sink to the bottom and line up with the charges list. */}
        <div className="flex min-w-0 flex-col">
          <h2 className="text-[15px] font-medium">{t('dashboard.hero.runRate')}</h2>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <InkGlyph state={attentionState} />
            <span>
              {attentionCount === 0
                ? t('dashboard.hero.allCovered')
                : t('dashboard.hero.needAttention', { count: attentionCount })}
            </span>
          </div>
          <div className="mt-auto pt-6">
            <p className="text-[34px] leading-none font-normal break-words">
              {formatMoney(monthly)}
              {base && <span className="ml-2 text-[18px] text-ink-2">{base}</span>}
            </p>
            <p className="mt-3 text-[13px] text-ink-2">
              {t('dashboard.hero.meta', {
                yearly: formatMoneyRound(summary?.yearlyProjection ?? '0', base),
                paid: formatMoneyRound(summary?.currentMonthPayments ?? '0', base),
                spent: formatMoneyRound(summary?.totalSpent ?? '0', base),
              })}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-[15px] font-medium">{t('dashboard.hero.nextCharges')}</h2>
            {shown.length > 0 && (
              <p className="text-xs text-ink-2">
                {t('dashboard.hero.chargesMeta', {
                  shown: shown.length,
                  total: upcoming.length,
                  amount: `${converted ? '≈ ' : ''}${formatMoney(sumMoney(shownCosts), base)}`,
                })}
              </p>
            )}
          </div>
          {shown.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {shown.map((b, i) => (
                <li
                  key={b.serviceUuid}
                  title={t('dashboard.hero.chargeTitle', {
                    provider: withAccount(b.providerName, b.accountLabel, t('common.accountMain')),
                    cost:
                      b.currency === base
                        ? formatMoney(b.cost, b.currency)
                        : `≈ ${formatMoney(shownCosts[i], base)}`,
                  })}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-14 shrink-0 text-[13px] text-ink-2">
                      {dayjs(b.nextBillingAt).format('DD MMM')}
                    </span>
                    <InkGlyph state={upcomingState(b)} label={coverageLabel(t, b.covered)} />
                    <span className="truncate">{b.name}</span>
                  </div>
                  <span className="shrink-0">{formatMoney(b.cost, b.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">{t('dashboard.empty.noUpcoming')}</p>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-x-12 gap-y-6 border-t border-hairline pt-6">
        {kpis.map((k) => (
          <div key={k.key} data-kpi-card="" className="min-w-[140px]">
            <p className="mb-1.5 text-[13px] text-ink-2">{k.label}</p>
            <p className="text-[15px] break-words">{formatMoney(k.value, base)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
