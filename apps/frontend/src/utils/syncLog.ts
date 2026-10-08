import type { SyncRun } from '@infra/shared';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import type { LogLine } from '@/components/ink/LogBlock';

const TS_FORMAT = 'DD.MM HH:mm:ss';

export const logTime = (iso: string | null | undefined) =>
  iso ? dayjs(iso).format(TS_FORMAT) : '—';

const firstLine = (text: string) => text.split('\n')[0].slice(0, 200);

interface SyncLogOptions {
  /** How many of the newest runs to show. */
  limit: number;
  /** Close an unresolved failure with a "sync failed · <kind>" verdict line. */
  tailKind?: string;
  /** With no runs on record, the account's own error still shows as one line. */
  fallbackError?: string | null;
}

/**
 * Sync runs (API order: newest first) → log lines reading oldest to newest. Only an unresolved
 * failure — the newest run being an error — is drawn in signal red; errors that a later run
 * recovered from stay in ink.
 */
export function syncLogLines(t: TFunction, runs: SyncRun[], opts: SyncLogOptions): LogLine[] {
  const newest = runs[0];
  const lines = runs
    .slice(0, opts.limit)
    .reverse()
    .map((r): LogLine => {
      const ts = logTime(r.startedAt);
      if (r.status === 'running') {
        return { ts, level: t('syncLog.running'), message: t('syncLog.inProgress'), tone: 'muted' };
      }
      if (r.status === 'ok') {
        const ms = r.finishedAt ? dayjs(r.finishedAt).diff(r.startedAt) : null;
        const parts = [t('syncLog.services', { count: r.servicesFound })];
        if (ms != null) parts.push(t('syncLog.seconds', { n: (ms / 1000).toFixed(1) }));
        return { ts, level: t('syncLog.ok'), message: parts.join(' · ') };
      }
      return {
        ts,
        level: t('syncLog.error'),
        message: firstLine(r.error ?? '') || t('syncLog.unknownError'),
        tone: r === newest ? 'error' : 'info',
      };
    });

  if (lines.length === 0 && opts.fallbackError) {
    lines.push({
      ts: '—',
      level: t('syncLog.error'),
      message: firstLine(opts.fallbackError),
      tone: 'error',
    });
  }
  const failing = newest ? newest.status === 'error' : Boolean(opts.fallbackError);
  if (failing && opts.tailKind) {
    lines.push({
      ts: newest ? logTime(newest.finishedAt ?? newest.startedAt) : '—',
      level: t('syncLog.error'),
      message: t('syncLog.failedTail', { kind: opts.tailKind }),
      tone: 'error',
    });
  }
  return lines;
}
