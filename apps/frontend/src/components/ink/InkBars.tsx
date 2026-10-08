import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface InkBar {
  key: string;
  value: number;
  /** actual = solid slate, estimated = half-tone slate, projected = outline (not yet real). */
  kind?: 'actual' | 'estimated' | 'projected';
  /** Plain-text summary (period + formatted amount): the bar's accessible name. */
  title?: string;
  /** Rich hover card for the bar; without it the chart stays a static picture. */
  tooltip?: ReactNode;
}

interface InkBarsProps {
  bars: InkBar[];
  /** Left / centre / right axis labels. */
  axis: [string, string, string];
  /** One stat line under the chart. */
  stat?: ReactNode;
  ariaLabel: string;
  height?: number;
  className?: string;
}

const PLOT = 'flex items-end rounded-t-md border-b border-hairline';

/** Fill per bar kind; legends reuse it so the swatches always match the bars. */
export const INK_BAR_KIND: Record<NonNullable<InkBar['kind']>, string> = {
  actual: 'bg-slate',
  estimated: 'bg-slate/50',
  projected: 'border border-b-0 border-slate/60',
};

function Bar({ bar, max, faded }: { bar: InkBar; max: number; faded: boolean }) {
  const pct = max > 0 && bar.value > 0 ? Math.max((bar.value / max) * 100, 2) : 0;
  // A zero month draws nothing: an outlined bar of zero height would still leave a dash.
  if (pct === 0) return null;
  return (
    <span
      className={cn(
        'block w-[5px] shrink-0 rounded-t-[2px] transition-opacity sm:w-1.5',
        INK_BAR_KIND[bar.kind ?? 'actual'],
        faded && 'opacity-35',
      )}
      style={{ height: `${pct}%` }}
    />
  );
}

/**
 * Thin bars on a soft baseline in the one accent tone; no gridlines. With tooltips each bar is a
 * button spanning its whole column (the bar itself is only a few pixels wide): hovering or
 * focusing it keeps that bar solid, fades the rest and shows its card. The list has a single
 * tab stop; arrow keys move between bars.
 */
export function InkBars({ bars, axis, stat, ariaLabel, height = 140, className }: InkBarsProps) {
  const [active, setActive] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const max = Math.max(0, ...bars.map((b) => b.value));
  const n = bars.length;
  const interactive = bars.some((b) => b.tooltip != null);
  const current = active != null ? bars[active] : undefined;
  // The newest bar is the natural entry point when tabbing into the chart.
  const tabStop = active ?? n - 1;

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next == null || next < 0 || next >= n) return;
    e.preventDefault();
    refs.current[next]?.focus();
  };

  // The card sits beside the bar, away from the nearer edge, so tall bars never push it out of
  // the (overflow-hidden) card the chart lives in.
  const centre = active != null ? ((active + 0.5) / n) * 100 : 0;
  const cardSide =
    active != null && active < n / 2
      ? { left: `calc(${centre}% + 14px)` }
      : { right: `calc(${100 - centre}% + 14px)` };

  return (
    <div className={cn('min-w-0', className)}>
      {interactive ? (
        <div className="relative">
          <ul aria-label={ariaLabel} className={PLOT} style={{ height }}>
            {bars.map((b, i) => (
              <li key={b.key} className="flex h-full flex-1">
                <button
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  type="button"
                  aria-label={b.title}
                  tabIndex={i === tabStop ? 0 : -1}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={cn(
                    'flex h-full w-full cursor-default items-end justify-center rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                    active === i && 'bg-foreground/[0.04]',
                  )}
                >
                  <Bar bar={b} max={max} faded={active != null && active !== i} />
                </button>
              </li>
            ))}
          </ul>
          {current?.tooltip != null && (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-1 z-10 min-w-44 rounded-lg bg-popover px-3 py-2.5 text-popover-foreground shadow-md"
              style={cardSide}
            >
              {current.tooltip}
            </div>
          )}
        </div>
      ) : (
        <div role="img" aria-label={ariaLabel} className={PLOT} style={{ height }}>
          {bars.map((b) => (
            <div
              key={b.key}
              title={b.title}
              className="flex h-full flex-1 items-end justify-center"
            >
              <Bar bar={b} max={max} faded={false} />
            </div>
          ))}
        </div>
      )}
      {/* Edge labels sit under the first and last bar rather than at the column edges. */}
      <div
        className="mt-2 flex justify-between gap-2 text-xs text-ink-3"
        style={{ paddingInline: n > 0 ? `max(0px, calc(${50 / n}% - 0.75rem))` : undefined }}
      >
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
        <span>{axis[2]}</span>
      </div>
      {stat != null && <p className="mt-3 text-[13px] text-ink-2">{stat}</p>}
    </div>
  );
}
