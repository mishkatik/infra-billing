import type { AnalyticsSummary } from '@infra/shared';
import { IconCalendarDollar, IconCash, IconChartBar, IconWallet } from '@tabler/icons-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/components/StatCard';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';

interface KpiCardsProps {
  summary: AnalyticsSummary | undefined;
  base: string;
}

function oneLineWidth(el: HTMLElement): number {
  const prev = {
    whiteSpace: el.style.whiteSpace,
    width: el.style.width,
    maxWidth: el.style.maxWidth,
  };
  el.style.whiteSpace = 'nowrap';
  el.style.width = 'max-content';
  el.style.maxWidth = 'none';
  const width = Math.ceil(el.getBoundingClientRect().width);
  el.style.whiteSpace = prev.whiteSpace;
  el.style.width = prev.width;
  el.style.maxWidth = prev.maxWidth;
  return width;
}

function cardChrome(card: HTMLElement): number {
  const s = getComputedStyle(card);
  const pad =
    Number.parseFloat(s.paddingLeft) +
    Number.parseFloat(s.paddingRight) +
    Number.parseFloat(s.borderLeftWidth) +
    Number.parseFloat(s.borderRightWidth);
  const gap = Number.parseFloat(s.columnGap || s.gap || '0') || 0;
  const icon = card.querySelector<HTMLElement>('[data-kpi-icon]');
  const iconW = icon ? Math.ceil(icon.getBoundingClientRect().width) : 36;
  return pad + gap + iconW;
}

type Cols = 4 | 2 | 1;

export function KpiCards({ summary, base }: KpiCardsProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const colsRef = useRef<Cols>(4);
  const [cols, setCols] = useState<Cols>(4);
  const deps = [
    base,
    summary?.monthlyTotal,
    summary?.yearlyProjection,
    summary?.currentMonthPayments,
    summary?.totalSpent,
    t('dashboard.kpi.currentMonthPayments'),
  ].join('|');

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const measure = () => {
      const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-kpi-card]'));
      if (cards.length === 0) return;

      const gap = Number.parseFloat(getComputedStyle(root).gap || '0') || 0;
      const current = colsRef.current;

      const fits = (n: Cols, slack: number) => {
        const colW = (root.clientWidth - gap * (n - 1)) / n;
        if (colW <= 0) return false;
        return cards.every((card) => {
          const available = colW - cardChrome(card) - slack;
          const label = card.querySelector<HTMLElement>('[data-kpi-label]');
          const value = card.querySelector<HTMLElement>('[data-kpi-value]');
          if (!label || !value) return true;
          return oneLineWidth(label) <= available && oneLineWidth(value) <= available;
        });
      };

      const liveOverflow = cards.some((card) => {
        const label = card.querySelector<HTMLElement>('[data-kpi-label]');
        const value = card.querySelector<HTMLElement>('[data-kpi-value]');
        return (
          (!!label && label.scrollWidth > label.clientWidth + 2) ||
          (!!value && value.scrollWidth > value.clientWidth + 2)
        );
      });
      const maxAllowed: Cols = liveOverflow ? (current === 4 ? 2 : 1) : 4;

      let next: Cols = 1;
      for (const n of [4, 2, 1] as const) {
        if (n > maxAllowed) continue;
        // Slight hysteresis on expand only - keep denser layout until just past the edge.
        const slack = n > current ? 8 : 2;
        if (fits(n, slack)) {
          next = n;
          break;
        }
      }
      colsRef.current = next;
      setCols(next);
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
      className={cn(
        'grid gap-4',
        cols === 4 && 'grid-cols-4',
        cols === 2 && 'grid-cols-2',
        cols === 1 && 'grid-cols-1',
      )}
    >
      <StatCard
        label={t('dashboard.kpi.monthly')}
        value={formatMoney(summary?.monthlyTotal ?? '0', base)}
        icon={IconWallet}
      />
      <StatCard
        label={t('dashboard.kpi.yearly')}
        value={formatMoney(summary?.yearlyProjection ?? '0', base)}
        icon={IconChartBar}
        color="blue"
      />
      <StatCard
        label={t('dashboard.kpi.currentMonthPayments')}
        value={formatMoney(summary?.currentMonthPayments ?? '0', base)}
        icon={IconCash}
        color="teal"
      />
      <StatCard
        label={t('dashboard.kpi.totalSpent')}
        value={formatMoney(summary?.totalSpent ?? '0', base)}
        icon={IconCalendarDollar}
        color="grape"
      />
    </div>
  );
}
