import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
}

/** Quiet text tabs; the active one sits on a soft tone. Radiogroup with arrow-key roving. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex h-8 max-w-full shrink-0 items-stretch gap-0.5', className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          // Tabs, not native radios: the group needs the tab look and roving focus.
          // biome-ignore lint/a11y/useSemanticElements: styled radio tabs
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            // With no active pill (e.g. a custom range) the first one keeps the group reachable by Tab.
            tabIndex={active || (i === 0 && !options.some((x) => x.value === value)) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              // No colour transition: two tabs cross-fading at once reads as a blink, so the
              // selection flips instantly.
              'relative inline-flex items-center gap-1.5 rounded-md px-2.5 text-[13px] whitespace-nowrap outline-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              active ? 'bg-accent font-medium text-foreground' : 'text-ink-2 hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
