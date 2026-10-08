import { cn } from '@/lib/utils';

/**
 * One status vocabulary for the whole app: a small dot. Filled dots carry a muted tone (sage ok,
 * ochre attention, brick failure, slate in progress); hollow rings mean "nothing yet" (pending)
 * or "switched off" (dashed). Next to it there is always a word — a note, an error, a label — so
 * the tone is never the only signal.
 */
export type InkState = 'ok' | 'progress' | 'pending' | 'off' | 'warn' | 'failed';

interface InkGlyphProps {
  state: InkState;
  /** Accessible name. Without it the glyph is decorative and the adjacent text carries the meaning. */
  label?: string;
  size?: number;
  className?: string;
}

const TONE: Record<InkState, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  failed: 'text-destructive',
  progress: 'text-slate ink-pulse',
  pending: 'text-ink-3',
  off: 'text-ink-3',
};

function Shape({ state }: { state: InkState }) {
  if (state === 'pending') {
    return <circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />;
  }
  if (state === 'off') {
    return (
      <circle
        cx="6"
        cy="6"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray="1.6 1.55"
      />
    );
  }
  return <circle cx="6" cy="6" r="3.5" fill="currentColor" />;
}

export function InkGlyph({ state, label, size = 12, className }: InkGlyphProps) {
  const cls = cn('inline-block shrink-0', TONE[state], className);
  if (!label) {
    return (
      <svg viewBox="0 0 12 12" width={size} height={size} className={cls} aria-hidden>
        <Shape state={state} />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      className={cls}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <Shape state={state} />
    </svg>
  );
}
