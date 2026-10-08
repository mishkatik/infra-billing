import type { AccountSpendDay } from '@infra/shared';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useAccountSpend } from '@/api/analytics';
import { INK_BAR_KIND, type InkBar, InkBars } from '@/components/ink/InkBars';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';

const FULL_WINDOW = 30;

// The day strings are UTC calendar dates; parsing a bare 'YYYY-MM-DD' keeps the same date in
// any browser zone (a timestamp would slide a day back west of UTC).
const dayOf = (date: string) => dayjs(date);

// What the account spent over the last 30 days: three figures and a bar per day. Hidden while
// loading and when the account has neither charges nor balance snapshots to go by.
export function AccountSpend({ accountUuid }: { accountUuid: string }) {
  const { t } = useTranslation();
  const { data } = useAccountSpend(accountUuid);
  if (data?.source == null) return null;

  const { currency, days, approximate, coveredDays } = data;
  const approx = (value: string | null) =>
    `${approximate && value != null ? '≈ ' : ''}${formatMoney(value, currency)}`;

  const figures: [string, string][] = [
    [t('providers.spend.last7'), approx(data.last7d)],
    [
      coveredDays < FULL_WINDOW
        ? t('providers.spend.lastN', { n: coveredDays })
        : t('providers.spend.last30'),
      approx(data.last30d),
    ],
    [t('providers.spend.perDay'), approx(data.perDay)],
  ];

  const amountText = (d: AccountSpendDay) =>
    d.amount == null ? t('providers.spend.noData') : formatMoney(d.amount, currency);

  const tooltip = (d: AccountSpendDay) => (
    <div className="space-y-2">
      <p className="text-xs text-ink-2">{dayOf(d.date).format('D MMM, ddd')}</p>
      <div>
        <p
          className={cn(
            'text-[15px] whitespace-nowrap',
            d.amount == null ? 'text-ink-2' : 'font-medium',
          )}
        >
          {amountText(d)}
        </p>
        {d.estimated && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
            <span aria-hidden className={cn('size-2 rounded-[2px]', INK_BAR_KIND.estimated)} />
            {t('providers.spend.estimated')}
          </p>
        )}
      </div>
    </div>
  );

  const bars: InkBar[] = days.map((d) => ({
    key: d.date,
    value: d.amount == null ? 0 : Number(d.amount),
    kind: d.estimated ? 'estimated' : 'actual',
    title: [
      dayOf(d.date).format('D MMM'),
      amountText(d),
      d.estimated ? t('providers.spend.estimated') : null,
    ]
      .filter(Boolean)
      .join(' · '),
    tooltip: tooltip(d),
  }));

  const first = days[0]?.date;
  const mid = days[Math.floor((days.length - 1) / 2)]?.date;
  const last = days[days.length - 1]?.date;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="section-label">{t('providers.spend.title')}</p>
        <p className="text-xs text-ink-3">
          {data.source === 'charges'
            ? t('providers.spend.fromCharges')
            : t('providers.spend.fromSnapshots')}
        </p>
      </div>
      <div className="rounded-lg bg-card p-3">
        <dl className="grid grid-cols-3 gap-3">
          {figures.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[13px] text-ink-2">{label}</dt>
              <dd className="mt-0.5 truncate text-[15px] font-medium" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {first && mid && last && (
          <InkBars
            className="mt-4"
            bars={bars}
            height={64}
            ariaLabel={t('providers.spend.aria', {
              from: dayOf(first).format('D MMM'),
              to: dayOf(last).format('D MMM'),
            })}
            axis={[
              dayOf(first).format('D MMM'),
              dayOf(mid).format('D MMM'),
              dayOf(last).format('D MMM'),
            ]}
          />
        )}
      </div>
    </div>
  );
}
