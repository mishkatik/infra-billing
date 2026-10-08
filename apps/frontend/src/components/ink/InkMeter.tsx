import { cn } from '@/lib/utils';

interface InkMeterProps {
  label: string;
  /** Short value for the label row, e.g. "69%" or "412/600". */
  value: string;
  /** Optional line under the bar for longer figures ("2 584 / 6 225 RUB"). */
  detail?: string;
  /** Filled share, 0..1; null hides the bar (nothing to compare against). Values above 1 are capped. */
  ratio: number | null;
  className?: string;
}

/** Quiet quota meter: a thin bar on a soft track, no colour thresholds at any level. */
export function InkMeter({ label, value, detail, ratio, className }: InkMeterProps) {
  const share = ratio == null ? null : Math.min(Math.max(ratio, 0), 1);
  return (
    <div className={cn('rounded-lg bg-background p-3.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] text-ink-2">{label}</span>
        <span className="shrink-0 text-xs text-ink-2">{value}</span>
      </div>
      {share != null && (
        // A styled track instead of <meter>: the native element can't be drawn as a flat bar
        // consistently across browsers.
        // biome-ignore lint/a11y/useSemanticElements: custom-drawn meter
        <div
          className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-border"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
          // The bar caps at 100%; the text carries the real figure (a month can overpay).
          aria-valuetext={value}
        >
          <div className="h-full rounded-full bg-ink-3" style={{ width: `${share * 100}%` }} />
        </div>
      )}
      {detail && <p className="mt-2 truncate text-[11px] text-ink-3">{detail}</p>}
    </div>
  );
}
