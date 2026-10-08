import type { Provider, ProviderAccount } from '@infra/shared';
import { IconCornerDownRight, IconExternalLink, IconRefresh } from '@tabler/icons-react';
import { useMutationState } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { SYNC_ALL_KEY, SYNC_KEY } from '@/api/providers';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { ProviderIcon } from '@/components/ProviderIcon';
import { SortableTableHead } from '@/components/SortableTableHead';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SortState } from '@/hooks/useTableSort';
import { cn } from '@/lib/utils';
import { providerFavicon } from '@/utils/favicon';
import { formatDate, formatMoney, truncate } from '@/utils/format';
import {
  type ProviderSyncState,
  SYNC_STATE_GLYPH,
  type SyncActivity,
  accountSyncState,
  providerSyncState,
} from '@/utils/providerState';
import type { ProviderSortKey } from './providersSort';

/** A provider plus the accounts to list under it (only drawn when it has several). */
export interface ProviderTableRow {
  provider: Provider;
  accounts: ProviderAccount[];
}

interface ProvidersTableProps {
  rows: ProviderTableRow[] | undefined;
  isLoading: boolean;
  activity: SyncActivity;
  /** True when a state filter hides every provider (as opposed to having none at all). */
  filtered: boolean;
  nextSyncAt: string | null | undefined;
  kindLabel: (kind: string) => string;
  sort: SortState<ProviderSortKey> | null;
  onToggleSort: (key: ProviderSortKey) => void;
  /** Opens the detail modal; `accountUuid` focuses that account's card. */
  onRowClick: (p: Provider, accountUuid?: string) => void;
  /** Syncs every enabled account of the provider. */
  onSyncProvider: (p: Provider) => void;
  onSyncAccount: (accountUuid: string) => void;
}

// Numeric columns sit flush right; the sort button inside keeps its edge on the cell padding.
const NUM_HEAD = 'text-right [&>button]:-mr-2 [&>button]:ml-0';

/** When each running sync was submitted, so an in-flight row can count its seconds. */
function useSyncStarts() {
  const single = useMutationState({
    filters: { mutationKey: SYNC_KEY, status: 'pending' },
    select: (m) => ({ uuid: m.state.variables as string, at: m.state.submittedAt }),
  });
  const all = useMutationState({
    filters: { mutationKey: SYNC_ALL_KEY, status: 'pending' },
    select: (m) => m.state.submittedAt,
  });
  return (accountUuids: string[]): number | undefined =>
    single.find((s) => accountUuids.includes(s.uuid))?.at ?? all[0] ?? undefined;
}

function Elapsed({ since }: { since: number | undefined }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!since) return null;
  return (
    <span>{t('providers.elapsed', { s: Math.max(0, Math.floor((now - since) / 1000)) })}</span>
  );
}

interface LastSyncProps {
  state: ProviderSyncState;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

function LastSync({ state, lastSyncAt, lastSyncError }: LastSyncProps) {
  if (state === 'failed' && lastSyncError) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block max-w-[320px] truncate text-[13px] text-destructive">
            {truncate(lastSyncError, 40)}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[420px] space-y-1 whitespace-normal text-pretty px-3 py-2">
          <p className="text-ink-3">{formatDate(lastSyncAt)}</p>
          <p>{lastSyncError}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  if (state === 'manual' || !lastSyncAt) {
    return <span className="text-[13px] text-ink-3">—</span>;
  }
  return (
    <span className="text-[13px] text-ink-2" title={formatDate(lastSyncAt)}>
      {dayjs(lastSyncAt).fromNow()}
    </span>
  );
}

// Row buttons must not also open the detail modal (mouse or keyboard).
const stop = {
  onClick: (e: MouseEvent) => e.stopPropagation(),
  onKeyDown: (e: KeyboardEvent) => e.stopPropagation(),
};

function SyncAction({
  state,
  since,
  onSync,
}: {
  state: ProviderSyncState;
  since: number | undefined;
  onSync: () => void;
}) {
  const { t } = useTranslation();
  if (state === 'syncing') {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 text-[13px] text-ink-2">
        <InkGlyph state="progress" />
        <Elapsed since={since} />
      </span>
    );
  }
  if (state !== 'failed' && state !== 'ok' && state !== 'never') return null;
  const failed = state === 'failed';
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('-mr-2.5', failed && 'text-destructive hover:text-destructive')}
      onClick={(e) => {
        e.stopPropagation();
        onSync();
      }}
      onKeyDown={stop.onKeyDown}
    >
      <IconRefresh className="size-3.5" stroke={1.5} />
      {failed ? t('providers.retry') : t('providers.sync')}
    </Button>
  );
}

// Clickable row: Enter/Space open it like a click (Space would scroll the page by default).
function rowHandlers(open: () => void) {
  return {
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.key === ' ') e.preventDefault();
      open();
    },
  };
}

const ROW_CLASS =
  'cursor-pointer focus-visible:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

function balanceLines(p: Provider): ReactNode {
  if (p.balances.length === 0) return formatMoney(null);
  return p.balances.map((b) => (
    <span key={b.currency} className="block">
      {formatMoney(b.amount, b.currency)}
    </span>
  ));
}

/** The newest successful sync over the accounts. */
function newestSync(accounts: ProviderAccount[]): string | null {
  let newest: string | null = null;
  for (const a of accounts) {
    if (a.lastSyncAt && (!newest || dayjs(a.lastSyncAt).isAfter(newest))) newest = a.lastSyncAt;
  }
  return newest;
}

export function ProvidersTable({
  rows,
  isLoading,
  activity,
  filtered,
  nextSyncAt,
  kindLabel,
  sort,
  onToggleSort,
  onRowClick,
  onSyncProvider,
  onSyncAccount,
}: ProvidersTableProps) {
  const { t } = useTranslation();
  const syncStart = useSyncStarts();
  const mainLabel = t('common.accountMain');
  const sortHead = (key: ProviderSortKey, label: string, className?: string) => (
    <SortableTableHead
      label={label}
      active={sort?.key === key ? sort.dir : null}
      onToggle={() => onToggleSort(key)}
      className={className}
    />
  );

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('providers.tableTitle')} count={rows?.length ?? 0}>
        {nextSyncAt && (
          <p className="truncate text-[13px] text-ink-2">
            {t('providers.nextSync')} <span className="ml-1">{formatDate(nextSyncAt)}</span>
          </p>
        )}
      </CardHeadRow>
      <div className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-px pl-6">
                <span className="sr-only">{t('providers.th.status')}</span>
              </TableHead>
              {sortHead('name', t('providers.th.name'))}
              {sortHead('balance', t('providers.th.balance'), NUM_HEAD)}
              {sortHead('services', t('providers.th.services'), NUM_HEAD)}
              {sortHead('payments', t('providers.th.payments'), NUM_HEAD)}
              <TableHead>{t('providers.th.lastSync')}</TableHead>
              <TableHead className="w-24 pr-6">
                <span className="sr-only">{t('providers.th.action')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map(({ provider: p, accounts }) => {
              const state = providerSyncState(p, activity);
              // The note column describes the stored result, even while a new run is going.
              const stored = providerSyncState(p);
              const single = p.accounts.length === 1 ? p.accounts[0] : null;
              const off = state === 'off';
              return (
                <Fragment key={p.uuid}>
                  <TableRow
                    className={cn(
                      ROW_CLASS,
                      // Tint the cells, not the row: Chromium paints a row background per cell and
                      // leaves hairline seams at fractional column edges.
                      stored === 'failed' && '*:bg-fail-bg',
                      off && 'opacity-60',
                    )}
                    {...rowHandlers(() => onRowClick(p))}
                  >
                    <TableCell className="pl-6">
                      <InkGlyph state={SYNC_STATE_GLYPH[state]} label={t(`syncState.${state}`)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <ProviderIcon
                          name={p.name}
                          src={providerFavicon(p)}
                          iconName={p.iconName}
                          iconBg={p.iconBg}
                          size={24}
                        />
                        <span className="truncate font-medium">{p.name}</span>
                        <Badge variant="secondary" className="font-mono">
                          {kindLabel(p.kind)}
                        </Badge>
                        {off && <Badge variant="secondary">{t('providers.badgeDisabled')}</Badge>}
                        {p.loginUrl && (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon-xs"
                            className="text-ink-3 hover:text-foreground"
                          >
                            <a
                              href={p.loginUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={p.loginUrl}
                              {...stop}
                            >
                              <IconExternalLink className="size-3.5" stroke={1.5} />
                            </a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{balanceLines(p)}</TableCell>
                    <TableCell className="text-right">{p.servicesCount}</TableCell>
                    <TableCell className="text-right">{p.paymentsCount}</TableCell>
                    <TableCell>
                      {/* Several accounts: each sub-row carries its own error note. */}
                      <LastSync
                        state={stored}
                        lastSyncAt={single ? single.lastSyncAt : newestSync(p.accounts)}
                        lastSyncError={single?.lastSyncError ?? null}
                      />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <SyncAction
                        state={state}
                        since={syncStart(p.accounts.map((a) => a.uuid))}
                        onSync={() => onSyncProvider(p)}
                      />
                    </TableCell>
                  </TableRow>
                  {p.accounts.length > 1 &&
                    accounts.map((a) => {
                      const aState = accountSyncState(p.kind, a, activity);
                      const aStored = accountSyncState(p.kind, a);
                      return (
                        <TableRow
                          key={a.uuid}
                          className={cn(
                            ROW_CLASS,
                            aStored === 'failed' && '*:bg-fail-bg',
                            aState === 'off' && 'opacity-60',
                          )}
                          {...rowHandlers(() => onRowClick(p, a.uuid))}
                        >
                          <TableCell className="pl-6">
                            <InkGlyph
                              state={SYNC_STATE_GLYPH[aState]}
                              label={t(`syncState.${aState}`)}
                            />
                          </TableCell>
                          <TableCell>
                            {/* A corner arrow under the provider icon ties the account to the
                                row above; the label lines up with the provider name. */}
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex w-6 shrink-0 justify-center" aria-hidden>
                                <IconCornerDownRight
                                  size={16}
                                  stroke={1.5}
                                  className="text-slate"
                                />
                              </span>
                              <span className="truncate text-ink-2">{a.label ?? mainLabel}</span>
                              {aState === 'off' && (
                                <Badge variant="secondary">{t('providers.badgeDisabled')}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(a.balance, a.balanceCurrency)}
                          </TableCell>
                          <TableCell className="text-right">{a.servicesCount}</TableCell>
                          <TableCell className="text-right">{a.paymentsCount}</TableCell>
                          <TableCell>
                            <LastSync
                              state={aStored}
                              lastSyncAt={a.lastSyncAt}
                              lastSyncError={a.lastSyncError}
                            />
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <SyncAction
                              state={aState}
                              since={syncStart([a.uuid])}
                              onSync={() => onSyncAccount(a.uuid)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })}
            {!isLoading && rows?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <p className="py-8 text-center text-ink-2">
                    {filtered ? t('providers.emptyFiltered') : t('providers.empty')}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
