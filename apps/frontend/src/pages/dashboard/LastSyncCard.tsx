import type { Provider } from '@infra/shared';
import { IconRefresh } from '@tabler/icons-react';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { syncRunsQuery, useSyncAccount, useSyncActivity } from '@/api/providers';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { LogBlock } from '@/components/ink/LogBlock';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { notifyError } from '@/utils/notify';
import { accountDisplayName, accountSyncState } from '@/utils/providerState';
import { logTime, syncLogLines } from '@/utils/syncLog';
import { notifySyncRun } from '@/utils/syncNotify';

const LOG_LINES = 8;
// Bounded fan-out: there is no cross-account runs endpoint, so look at a few failing accounts.
const MAX_FAILING = 3;

export function LastSyncCard({ providers }: { providers: Provider[] | undefined }) {
  const { t } = useTranslation();
  const activity = useSyncActivity();
  const sync = useSyncAccount();
  const mainLabel = t('common.accountMain');
  // Everything here works per account: each one syncs, fails and logs on its own.
  const api = (providers ?? [])
    .filter((p) => p.kind !== 'manual')
    .flatMap((provider) =>
      provider.accounts.map((account) => ({
        provider,
        account,
        name: accountDisplayName(provider, account, mainLabel),
      })),
    );
  const failing = api
    .filter((a) => accountSyncState(a.provider.kind, a.account) === 'failed')
    .sort((a, b) => (b.account.lastSyncAt ?? '').localeCompare(a.account.lastSyncAt ?? ''));

  const runQueries = useQueries({
    queries: failing.slice(0, MAX_FAILING).map((a) => syncRunsQuery(a.account.uuid)),
  });

  if (api.length === 0) return null;

  if (failing.length === 0) {
    const synced = api
      .filter((a) => a.account.lastSyncAt)
      .sort((a, b) => b.account.lastSyncAt!.localeCompare(a.account.lastSyncAt!))
      .slice(0, LOG_LINES)
      .reverse();
    return (
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex min-h-14 items-center gap-2 border-b border-hairline px-6 py-3">
          <InkGlyph state="ok" />
          <h2 className="truncate text-[15px] font-medium">{t('dashboard.log.allSynced')}</h2>
        </div>
        <div className="flex-1 p-6">
          {synced.length > 0 ? (
            <LogBlock
              className="h-full"
              lines={synced.map((a) => ({
                ts: logTime(a.account.lastSyncAt),
                level: t('syncLog.ok'),
                message: t('dashboard.log.synced', { name: a.name }),
              }))}
            />
          ) : (
            <p className="text-sm text-ink-2">{t('dashboard.log.noSyncs')}</p>
          )}
        </div>
      </Card>
    );
  }

  // The account whose newest run failed most recently decides which log to show.
  const candidates = runQueries.flatMap((q, i) => {
    const newest = q.data?.[0];
    return q.data && newest?.status === 'error' ? [{ entry: failing[i], runs: q.data }] : [];
  });
  const latest = candidates.sort((a, b) =>
    b.runs[0].startedAt.localeCompare(a.runs[0].startedAt),
  )[0];
  const shown = latest?.entry ?? failing[0];
  // Runs not loaded (or none kept): fall back to what the account record says.
  const lines = syncLogLines(t, latest?.runs ?? [], {
    limit: LOG_LINES,
    tailKind: shown.provider.kind,
    fallbackError: shown.account.lastSyncError,
  });

  const pending = activity.all || activity.syncing.has(shown.account.uuid);
  const rerun = async () => {
    try {
      notifySyncRun(t, await sync.mutateAsync(shown.account.uuid));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex min-h-14 items-center gap-3 border-b border-hairline px-6 py-3">
        <h2 className="shrink-0 text-[15px] font-medium">{t('dashboard.log.lastFailed')}</h2>
        <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />
        <span className="min-w-0 truncate text-[13px] text-ink-2">{shown.name}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0"
          disabled={pending}
          onClick={rerun}
        >
          {pending ? <InkGlyph state="progress" /> : <IconRefresh />}
          {t('dashboard.log.rerun')}
        </Button>
      </div>
      <div className="flex-1 p-6">
        <LogBlock className="h-full" lines={lines} />
      </div>
    </Card>
  );
}
