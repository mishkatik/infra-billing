import type { ForecastPoint } from '@infra/shared';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/api/settings';
import { INK_BAR_KIND, type InkBar, InkBars } from '@/components/ink/InkBars';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import { roundMoney, sumMoney } from '@/utils/money';
import { CardHeadRow } from '@/components/ink/CardHeadRow';

interface SpendByMonthCardProps {
  forecast: ForecastPoint[] | undefined;
  base: string;
}

/** A leading month below this share of the busiest past month counts as "not tracked yet". */
const MEANINGFUL_SHARE = 0.2;
const MIN_PAST_MONTHS = 3;

export function SpendByMonthCard({ forecast, base }: SpendByMonthCardProps) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  // Force mode already folds the tariff fill into `actual`; showing `estimated` too would double it.
  const showEstimated =
    Boolean(settings?.forecastTariffBackfill) && !settings?.forecastTariffBackfillForce;
  const thisMonth = dayjs().format('YYYY-MM');

  const all = (forecast ?? []).map((p) => {
    const future = p.month > thisMonth;
    let kind: NonNullable<InkBar['kind']> = 'projected';
    let amount = p.projected;
    // The estimate is the full portfolio cost of the month, so it replaces the (partial) actual.
    if (!future && showEstimated && Number(p.estimated) > 0) {
      kind = 'estimated';
      amount = p.estimated;
    } else if (!future && Number(p.actual) > 0) {
      kind = 'actual';
      amount = p.actual;
    }
    return { month: p.month, future, kind, amount: roundMoney(amount), actual: p.actual };
  });

  // The first months of a history are often near-empty (before the payments were imported), and
  // they only draw a row of stubs. Start at the first month that carries a real share of the peak,
  // keeping at least a few past months so a young history still has a shape.
  const pastAll = all.filter((p) => !p.future);
  const peak = Math.max(0, ...pastAll.map((p) => Number(p.amount)));
  const firstReal = pastAll.findIndex((p) => Number(p.amount) >= peak * MEANINGFUL_SHARE);
  const start = Math.min(Math.max(firstReal, 0), Math.max(pastAll.length - MIN_PAST_MONTHS, 0));
  const points = all.slice(start);

  const kindLabel = {
    actual: t('dashboard.charts.actualSeries'),
    estimated: t('dashboard.charts.estimatedSeries'),
    projected: t('dashboard.charts.forecastSeries'),
  };
  const monthOf = (m: string) => dayjs(`${m}-01`);

  const past = points.filter((p) => !p.future);
  const next = points.filter((p) => p.future);
  const spent = sumMoney(past.map((p) => p.amount));
  const avg = past.length > 0 ? (Number(spent) / past.length).toFixed(2) : '0';

  // "+12%" / "−8%" against the past-month average; nothing when there is no average yet.
  const vsAvg = (amount: string) => {
    if (Number(avg) <= 0) return null;
    const diff = Math.round((Number(amount) / Number(avg) - 1) * 100);
    return diff === 0 ? '0%' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}%`;
  };

  const tooltip = (p: (typeof points)[number]) => {
    const rows: [string, string][] = [];
    // The estimate replaces the partial actual on the bar; keep what was really paid visible.
    if (p.kind === 'estimated' && Number(p.actual) > 0) {
      rows.push([t('dashboard.charts.paid'), formatMoney(roundMoney(p.actual), base)]);
    }
    const share = vsAvg(p.amount);
    if (share) rows.push([t('dashboard.charts.vsAvg'), share]);
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink-2">
          {monthOf(p.month).format('MMMM YYYY')}
          {p.month === thisMonth && ` · ${t('dashboard.charts.inProgress')}`}
        </p>
        <div>
          <p className="text-[15px] font-medium whitespace-nowrap">{formatMoney(p.amount, base)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
            <span aria-hidden className={cn('size-2 rounded-[2px]', INK_BAR_KIND[p.kind])} />
            {kindLabel[p.kind]}
          </p>
        </div>
        {rows.length > 0 && (
          <dl className="space-y-1 border-t border-hairline pt-2 text-xs">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-ink-2">{label}</dt>
                <dd className="whitespace-nowrap">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  };

  const bars: InkBar[] = points.map((p) => ({
    key: p.month,
    value: Number(p.amount),
    kind: p.kind,
    title: `${monthOf(p.month).format('MMM YYYY')} · ${formatMoney(p.amount, base)} · ${kindLabel[p.kind]}`,
    tooltip: tooltip(p),
  }));
  const hasData = bars.some((b) => b.value > 0);
  const kinds = (['actual', 'estimated', 'projected'] as const).filter((k) =>
    points.some((p) => p.kind === k && Number(p.amount) > 0),
  );

  const first = points[0]?.month;
  const mid = points[Math.floor((points.length - 1) / 2)]?.month;
  const last = points[points.length - 1]?.month;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('dashboard.charts.forecast')}>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[13px] text-ink-2">
          {kinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-2">
              <span aria-hidden className={cn('size-2.5 rounded-[2px]', INK_BAR_KIND[k])} />
              {kindLabel[k]}
            </span>
          ))}
          {base && <span className="ml-2">{base}</span>}
        </div>
      </CardHeadRow>
      <div className="flex flex-1 flex-col p-6">
        {hasData && first && mid && last ? (
          <InkBars
            bars={bars}
            height={160}
            ariaLabel={t('dashboard.charts.aria', {
              from: monthOf(first).format('MMM YYYY'),
              to: monthOf(last).format('MMM YYYY'),
            })}
            axis={[
              monthOf(first).format('MMM YY'),
              monthOf(mid).format('MMM YY'),
              monthOf(last).format('MMM YY'),
            ]}
            stat={t('dashboard.charts.stat', {
              n: past.length,
              spent: formatMoney(spent),
              avg: formatMoney(avg),
              m: next.length,
              next: formatMoney(sumMoney(next.map((p) => p.amount))),
            })}
          />
        ) : (
          <p className="text-sm text-ink-2">{t('dashboard.empty.noData')}</p>
        )}
      </div>
    </Card>
  );
}
