import type { Provider } from '@infra/shared';
import { IconPlus, IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@/api/client';
import {
  useProviders,
  useSyncAccount,
  useSyncActivity,
  useSyncAllProviders,
} from '@/api/providers';
import { useRates } from '@/api/rates';
import { useSettings } from '@/api/settings';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { Segmented } from '@/components/ink/Segmented';
import { PageHeader } from '@/components/PageHeader';
import { ResetViewButton } from '@/components/ResetViewButton';
import { Button } from '@/components/ui/button';
import { useEnums } from '@/constants';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useSelectedParam } from '@/hooks/useSelectedParam';
import { sortRows, useTableSort } from '@/hooks/useTableSort';
import { buildRubMap } from '@/utils/money';
import { notifyError, notifySuccess } from '@/utils/notify';
import { accountSyncState, countSyncStates } from '@/utils/providerState';
import { notifySyncAll, notifySyncRun } from '@/utils/syncNotify';
import { ProviderDetailModal } from './ProviderDetailModal';
import { ProviderFormModal } from './ProviderFormModal';
import { type ProviderTableRow, ProvidersTable } from './ProvidersTable';
import { PROVIDER_SORT_KEYS, providerSortAccessors } from './providersSort';

// States the header filter understands (the sidebar sync group links here with ?state=).
const STATE_FILTERS = ['ok', 'failed', 'off', 'never'] as const;
type StateFilter = (typeof STATE_FILTERS)[number] | 'all';

function parseStateFilter(raw: string | null): StateFilter {
  return STATE_FILTERS.find((s) => s === raw) ?? 'all';
}

export function ProvidersPage() {
  const { t, i18n } = useTranslation();
  const enums = useEnums();
  const { data: providers, isLoading } = useProviders();
  const { data: rates } = useRates();
  const sync = useSyncAccount();
  const syncAll = useSyncAllProviders();
  const { data: settings } = useSettings();
  // The detail modal reads the provider from the query cache by uuid, so counters/balance/sync
  // status stay live while the modal is open (e.g. after "Sync now").
  const [detail, setDetail] = useState<{ uuid: string; account: string | null } | null>(null);
  const selected = providers?.find((p) => p.uuid === detail?.uuid) ?? null;
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);

  const { sort, toggleSort, resetSort } = useTableSort('providers-sort', PROVIDER_SORT_KEYS);
  const sorted = sortRows(
    providers,
    sort,
    providerSortAccessors({ rub: buildRubMap(rates), base: settings?.baseCurrency ?? 'RUB' }),
    i18n.language,
  );

  const activity = useSyncActivity();
  const [searchParams, setSearchParams] = useSearchParams();
  const stateFilter = parseStateFilter(searchParams.get('state'));
  const setStateFilter = (next: StateFilter) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'all') params.delete('state');
        else params.set('state', next);
        return params;
      },
      { replace: true },
    );
  // Counts and the filter go by the stored sync result, not the live one: an account that is being
  // synced must not drop out of "Failed" (or every one out of "Synced" during sync all) until the
  // run ends. They count accounts; a provider stays listed while any of its accounts matches, with
  // only the matching ones under it.
  const counts = countSyncStates(providers);
  const accountsTotal = providers?.reduce((n, p) => n + p.accounts.length, 0) ?? 0;
  const rows: ProviderTableRow[] | undefined = sorted
    ?.map((p) => ({
      provider: p,
      accounts:
        stateFilter === 'all'
          ? p.accounts
          : p.accounts.filter((a) => accountSyncState(p.kind, a) === stateFilter),
    }))
    .filter((r) => stateFilter === 'all' || r.accounts.length > 0);
  const filterOption = (value: StateFilter, label: string, count: number) => ({
    value,
    label: (
      <>
        {label}
        <span className="font-normal text-ink-3">{count}</span>
      </>
    ),
  });
  const filterOptions = [
    filterOption('all', t('common.all'), accountsTotal),
    filterOption('ok', t('syncState.ok'), counts.ok),
    filterOption('failed', t('syncState.failed'), counts.failed),
    filterOption('off', t('syncState.off'), counts.off),
    ...(counts.never > 0 || stateFilter === 'never'
      ? [filterOption('never', t('syncState.never'), counts.never)]
      : []),
  ];

  // Deep links: ?selected=<provider> opens the modal, an accompanying ?account=<uuid> focuses that
  // account's card. The account param is read when the modal opens and dropped right after.
  const accountParam = searchParams.get('account');
  useSelectedParam(providers, (p: Provider) => setDetail({ uuid: p.uuid, account: accountParam }));
  useEffect(() => {
    if (!accountParam || searchParams.has('selected')) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete('account');
        return params;
      },
      { replace: true },
    );
  }, [accountParam, searchParams, setSearchParams]);

  const syncAccount = async (uuid: string) => {
    try {
      notifySyncRun(t, await sync.mutateAsync(uuid));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  // A provider row syncs every enabled account; several runs end in one summary toast.
  const syncProvider = async (p: Provider) => {
    const enabled = p.accounts.filter((a) => a.isEnabled);
    if (enabled.length <= 1) {
      if (enabled[0]) await syncAccount(enabled[0].uuid);
      return;
    }
    const results = await Promise.allSettled(enabled.map((a) => sync.mutateAsync(a.uuid)));
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 'ok').length;
    const failed = results.length - ok;
    if (failed === 0) notifySuccess(t('providers.account.syncedMany', { count: ok }));
    else notifyError(t('providers.syncedMixed', { ok, failed }));
  };

  const doSyncAll = async () => {
    try {
      notifySyncAll(t, await syncAll.mutateAsync());
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('providers.title')}
        controls={
          <Segmented
            value={stateFilter}
            onChange={setStateFilter}
            options={filterOptions}
            ariaLabel={t('providers.stateFilter')}
          />
        }
        actions={
          <>
            {(sort || stateFilter !== 'all') && (
              <ResetViewButton
                onClick={() => {
                  resetSort();
                  setStateFilter('all');
                }}
              />
            )}
            {/* A sync-all may also be running from the palette or the dashboard. */}
            <Button variant="ghost" size="sm" disabled={activity.all} onClick={doSyncAll}>
              {activity.all ? (
                <InkGlyph state="progress" />
              ) : (
                <IconRefresh className="size-3.5" stroke={1.5} />
              )}
              {t('providers.syncAll')}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <IconPlus className="size-3.5" stroke={1.5} />
              {t('common.add')}
            </Button>
          </>
        }
      />

      <ProvidersTable
        rows={rows}
        isLoading={isLoading}
        activity={activity}
        filtered={stateFilter !== 'all' && (providers?.length ?? 0) > 0}
        nextSyncAt={settings?.nextSyncAt}
        kindLabel={enums.providerKindLabel}
        sort={sort}
        onToggleSort={toggleSort}
        onRowClick={(p, account) => setDetail({ uuid: p.uuid, account: account ?? null })}
        onSyncProvider={syncProvider}
        onSyncAccount={syncAccount}
      />

      <ProviderFormModal
        opened={createOpened}
        kindOptions={enums.providerKindOptions}
        onSyncAccount={syncAccount}
        onClose={closeCreate}
      />

      <ProviderDetailModal
        provider={selected}
        providers={providers ?? []}
        focusAccountUuid={detail?.account ?? null}
        kindOptions={enums.providerKindOptions}
        kindLabel={enums.providerKindLabel}
        onSyncAccount={syncAccount}
        onOpenProvider={(uuid) => setDetail({ uuid, account: null })}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
