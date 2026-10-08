import { cn } from '@/lib/utils';

export interface LogLine {
  /** Bracketed timestamp text, e.g. "10:42:01". */
  ts: string;
  level: string;
  message: string;
  /** muted = meta noise, info = regular line, error = the failing tail (brick). */
  tone?: 'muted' | 'info' | 'error';
}

const TONE: Record<NonNullable<LogLine['tone']>, string> = {
  muted: 'text-ink-3',
  info: 'text-ink-2',
  error: 'text-destructive',
};

/** Log excerpt on a soft inset; scrolls sideways instead of wrapping mid-token. */
export function LogBlock({ lines, className }: { lines: LogLine[]; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg bg-background p-4 font-mono text-xs leading-[1.7]',
        className,
      )}
    >
      {lines.map((l, i) => (
        <div
          // Lines are an immutable snapshot; the index is a stable key here.
          // biome-ignore lint/suspicious/noArrayIndexKey: static excerpt
          key={i}
          className={cn('whitespace-pre', TONE[l.tone ?? 'info'])}
        >
          <span className={l.tone === 'error' ? undefined : 'text-ink-3'}>[{l.ts}]</span>{' '}
          <span className="inline-block min-w-[3.25rem]">{l.level}</span> {l.message}
        </div>
      ))}
    </div>
  );
}
