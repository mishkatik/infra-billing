import type { Provider, ProviderAccount } from '@infra/shared';
import {
  IconBan,
  IconLoader2,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import {
  useDeleteProviderAccount,
  useSyncActivity,
  useSyncRuns,
  useUpdateProviderAccount,
} from '@/api/providers';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { LogBlock } from '@/components/ink/LogBlock';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';
import { SYNC_STATE_GLYPH, accountDisplayName, accountSyncState } from '@/utils/providerState';
import { syncLogLines } from '@/utils/syncLog';
import { AccountSpend } from './AccountSpend';
import { BalanceHistoryChart } from './BalanceHistoryChart';

const LOG_RUNS = 8;

interface ProviderAccountsSectionProps {
  provider: Provider;
  /** Account to scroll to and outline (deep link ?account=). */
  focusAccountUuid?: string | null;
  onSyncAccount: (accountUuid: string) => void;
  onAdd: () => void;
  onEdit: (account: ProviderAccount) => void;
}

// The provider's accounts, one card each: state, balance, spend, sync log, balance history and
// actions.
export function ProviderAccountsSection({
  provider,
  focusAccountUuid,
  onSyncAccount,
  onAdd,
  onEdit,
}: ProviderAccountsSectionProps) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-medium">
          {t('providers.account.title')}
          <span className="ml-2 font-normal text-ink-3">{provider.accounts.length}</span>
        </h3>
        <Button type="button" variant="ghost" size="sm" className="-mr-3" onClick={onAdd}>
          <IconPlus className="size-3.5" stroke={1.5} />
          {t('providers.account.add')}
        </Button>
      </div>
      {provider.accounts.map((a) => (
        <AccountCard
          key={a.uuid}
          provider={provider}
          account={a}
          focused={a.uuid === focusAccountUuid}
          onSync={onSyncAccount}
          onEdit={onEdit}
        />
      ))}
    </section>
  );
}

interface AccountCardProps {
  provider: Provider;
  account: ProviderAccount;
  focused: boolean;
  onSync: (accountUuid: string) => void;
  onEdit: (account: ProviderAccount) => void;
}

function AccountCard({ provider, account: a, focused, onSync, onEdit }: AccountCardProps) {
  const { t } = useTranslation();
  const activity = useSyncActivity();
  const update = useUpdateProviderAccount();
  const del = useDeleteProviderAccount();
  const ref = useRef<HTMLElement>(null);
  const api = provider.kind !== 'manual';
  const state = accountSyncState(provider.kind, a, activity);
  const isLast = provider.accounts.length <= 1;
  const mainLabel = t('common.accountMain');
  const name = accountDisplayName(provider, a, mainLabel);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  // Applies right away, independent of any form (same as the services on/off button).
  const toggleEnabled = async () => {
    try {
      await update.mutateAsync({ uuid: a.uuid, dto: { isEnabled: !a.isEnabled } });
      notifySuccess(
        t(a.isEnabled ? 'providers.account.disabledToast' : 'providers.account.enabledToast', {
          name,
        }),
      );
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const remove = async () => {
    if (!window.confirm(t('providers.account.confirmDelete', { name }))) return;
    try {
      await del.mutateAsync(a.uuid);
      notifySuccess(t('providers.account.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <article
      ref={ref}
      className={cn('space-y-4 rounded-xl bg-background p-5', focused && 'ring-1 ring-ring/40')}
    >
      {/* The word next to the dot names the state (it also says "Disabled" for a switched-off
          account), so the dot itself stays decorative. */}
      <header className="flex flex-wrap items-center gap-2">
        <InkGlyph state={SYNC_STATE_GLYPH[state]} />
        <span className={cn('font-medium', a.label == null && 'text-ink-2')}>
          {a.label ?? mainLabel}
        </span>
        <span className={cn('text-[13px]', state === 'failed' ? 'text-destructive' : 'text-ink-2')}>
          {t(`syncState.${state}`)}
        </span>
        {a.isPostpaid && <Badge variant="secondary">{t('providers.detail.postpaid')}</Badge>}
        <span className="ml-auto">{formatMoney(a.balance, a.balanceCurrency)}</span>
      </header>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <span>
          {t('providers.detail.services')}{' '}
          <span className="text-foreground">{a.servicesCount}</span>
        </span>
        <span>
          {t('providers.detail.payments')}{' '}
          <span className="text-foreground">{a.paymentsCount}</span>
        </span>
        {api && a.lastSyncAt && (
          <span>
            {t('providers.th.lastSync')}{' '}
            <span className="text-foreground" title={formatDate(a.lastSyncAt)}>
              {dayjs(a.lastSyncAt).fromNow()}
            </span>
          </span>
        )}
      </p>

      <AccountSpend accountUuid={a.uuid} />

      {(api || a.balance != null) && (
        <div className="grid gap-4 md:grid-cols-2">
          {api && <AccountSyncLog account={a} />}
          {a.balance != null && (
            <div className="space-y-2">
              <p className="section-label">{t('providers.detail.historyTitle')}</p>
              <BalanceHistoryChart account={a} className="rounded-lg bg-card p-3" />
            </div>
          )}
        </div>
      )}

      <footer className="-ml-3 flex flex-wrap items-center gap-1">
        {api &&
          (a.isEnabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={state === 'syncing'}
              onClick={() => onSync(a.uuid)}
            >
              {state === 'syncing' ? (
                <InkGlyph state="progress" />
              ) : (
                <IconRefresh className="size-3.5" stroke={1.5} />
              )}
              {t('providers.detail.syncNow')}
            </Button>
          ) : (
            <p className="px-3 text-[13px] text-ink-2">{t('providers.account.syncDisabled')}</p>
          ))}
        <div className="ml-auto flex items-center gap-1">
          {api && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={update.isPending}
              onClick={toggleEnabled}
            >
              {update.isPending ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : a.isEnabled ? (
                <IconBan className="size-3.5" stroke={1.5} />
              ) : (
                <IconPlayerPlay className="size-3.5" stroke={1.5} />
              )}
              {a.isEnabled ? t('providers.detail.disable') : t('providers.detail.enable')}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(a)}>
            <IconPencil className="size-3.5" stroke={1.5} />
            {t('providers.account.edit')}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button swallows hover, so the span carries the hint. */}
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-destructive"
                  aria-label={t('providers.account.delete')}
                  disabled={isLast || del.isPending}
                  onClick={remove}
                >
                  <IconTrash className="size-4" stroke={1.5} />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isLast ? t('providers.account.lastAccountHint') : t('providers.account.delete')}
            </TooltipContent>
          </Tooltip>
        </div>
      </footer>
    </article>
  );
}

// The account's recent runs as a log. Without a runs list (failed request or none kept yet) the
// account's own error still shows.
function AccountSyncLog({ account }: { account: ProviderAccount }) {
  const { t } = useTranslation();
  const runs = useSyncRuns(account.uuid);
  const lines = syncLogLines(t, runs.data ?? [], {
    limit: LOG_RUNS,
    fallbackError: runs.isLoading ? null : account.lastSyncError,
  });
  return (
    <div className="space-y-2">
      <p className="section-label">{t('providers.detail.syncTitle')}</p>
      {lines.length > 0 ? (
        <LogBlock lines={lines} className="max-h-56 overflow-y-auto bg-card p-3.5" />
      ) : (
        <p className="text-[13px] text-ink-3">
          {runs.isLoading ? t('common.loading') : t('syncLog.empty')}
        </p>
      )}
    </div>
  );
}
