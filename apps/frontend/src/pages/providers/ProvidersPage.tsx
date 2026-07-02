import type { Provider, ProviderKind } from '@infra/shared';
import { IconLoader2, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import {
  useCreateProvider,
  useDeleteProvider,
  useProviders,
  useSyncAllProviders,
  useSyncProvider,
  useUpdateProvider,
} from '@/api/providers';
import { useSettings } from '@/api/settings';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useEnums } from '@/constants';
import { useDisclosure } from '@/hooks/useDisclosure';
import { formatDate } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';
import { ProviderDetailModal } from './ProviderDetailModal';
import { ProviderFormModal } from './ProviderFormModal';
import { ProvidersTable } from './ProvidersTable';
import {
  EMPTY_FORM,
  type FormValues,
  buildCredentials,
  validateProviderCredentials,
} from './providerForm';

export function ProvidersPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: providers, isLoading } = useProviders();
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const del = useDeleteProvider();
  const sync = useSyncProvider();
  const syncAll = useSyncAllProviders();
  const { data: settings } = useSettings();
  // The detail modal reads the provider from the query cache by uuid, so counters/balance/sync
  // status stay live while the modal is open (e.g. after "Sync now").
  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  const selected = providers?.find((p) => p.uuid === detailUuid) ?? null;
  const [createOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);

  const form = useForm<FormValues>({ defaultValues: EMPTY_FORM, mode: 'onSubmit' });

  const openCreate = () => {
    form.reset({ ...EMPTY_FORM });
    openCreateModal();
  };
  const openDetail = (p: Provider) => {
    form.reset({
      ...EMPTY_FORM,
      name: p.name,
      kind: p.kind,
      loginUrl: p.loginUrl ?? '',
      // Non-secret fields are prefilled; password/totpSecret stay blank ("keep unchanged").
      baseUrl: p.baseUrl ?? '',
      username: p.username ?? '',
      accountId: p.accountId ?? '',
      projectName: p.projectName ?? '',
      panelId: p.panelId ?? '',
      isPostpaid: p.isPostpaid,
    });
    setDetailUuid(p.uuid);
  };

  const doSync = async (uuid: string) => {
    try {
      const run = await sync.mutateAsync(uuid);
      if (run.status === 'ok')
        notifySuccess(t('providers.syncedOne', { count: run.servicesFound }));
      else notifyError((run.error ?? '').slice(0, 200) || t('providers.syncFailed'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const submit = form.handleSubmit(async (v) => {
    if (!selected) {
      const err = validateProviderCredentials(v, t);
      if (err) {
        notifyError(err);
        return;
      }
    }
    const creds = buildCredentials(v);
    try {
      let saved: Provider;
      if (selected) {
        saved = await update.mutateAsync({
          uuid: selected.uuid,
          dto: {
            name: v.name,
            loginUrl: v.loginUrl || undefined,
            isPostpaid: v.isPostpaid,
            ...creds,
          },
        });
        setDetailUuid(null);
      } else {
        saved = await create.mutateAsync({
          name: v.name,
          kind: v.kind as ProviderKind,
          loginUrl: v.loginUrl || undefined,
          isPostpaid: v.isPostpaid,
          ...creds,
        });
        closeCreateModal();
      }
      notifySuccess(selected ? t('providers.updated') : t('providers.created'));
      // Auto-sync syncable providers so credential/token changes take effect right away.
      if (saved.kind !== 'manual') void doSync(saved.uuid);
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doSyncAll = async () => {
    try {
      const res = await syncAll.mutateAsync();
      if (res.failed === 0) notifySuccess(t('providers.syncedAll', { count: res.ok }));
      else notifyError(t('providers.syncedMixed', { ok: res.ok, failed: res.failed }));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doDelete = async (p: Provider) => {
    if (!window.confirm(t('providers.confirmDelete', { name: p.name }))) return;
    try {
      await del.mutateAsync(p.uuid);
      setDetailUuid(null);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title={t('providers.title')}
          subtitle={t('providers.subtitle')}
          actions={
            <>
              <Button variant="outline" disabled={syncAll.isPending} onClick={doSyncAll}>
                {syncAll.isPending ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconRefresh className="size-4" />
                )}
                {t('providers.syncAll')}
              </Button>
              <Button onClick={openCreate}>
                <IconPlus className="size-4" />
                {t('common.add')}
              </Button>
            </>
          }
        />
        {settings?.nextSyncAt && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('providers.nextSync', { when: formatDate(settings.nextSyncAt) })}
          </p>
        )}
      </div>

      <ProvidersTable
        providers={providers}
        isLoading={isLoading}
        syncingUuid={sync.isPending ? sync.variables : undefined}
        kindLabel={enums.providerKindLabel}
        onRowClick={openDetail}
      />

      <ProviderFormModal
        opened={createOpened}
        form={form}
        kindOptions={enums.providerKindOptions}
        isPending={create.isPending}
        onSubmit={submit}
        onClose={closeCreateModal}
      />

      <ProviderDetailModal
        provider={selected}
        form={form}
        kindOptions={enums.providerKindOptions}
        kindLabel={enums.providerKindLabel}
        isSaving={update.isPending}
        isSyncing={sync.isPending && sync.variables === selected?.uuid}
        onSubmit={submit}
        onSync={doSync}
        onDelete={doDelete}
        onClose={() => setDetailUuid(null)}
      />
    </div>
  );
}
