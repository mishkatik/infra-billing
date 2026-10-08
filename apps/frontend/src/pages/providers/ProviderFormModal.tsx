import type { ProviderKind } from '@infra/shared';
import { IconLoader2 } from '@tabler/icons-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useCreateProvider } from '@/api/providers';
import { DEFAULT_ICON_BG, canonicalTablerIconName } from '@/components/tablerIconCatalog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyError, notifySuccess } from '@/utils/notify';
import { ProviderAccountFields } from './ProviderAccountFields';
import { ProviderIdentityFields } from './ProviderIdentityFields';
import {
  type AccountFormValues,
  EMPTY_ACCOUNT,
  EMPTY_IDENTITY,
  type IdentityFormValues,
  buildCredentials,
  validateAccountCredentials,
} from './providerForm';

interface ProviderFormModalProps {
  opened: boolean;
  kindOptions: { value: string; label: string }[];
  /** Syncs a freshly created API account right away. */
  onSyncAccount: (accountUuid: string) => void;
  onClose: () => void;
}

// Create-only modal: the hoster identity plus its first account. Editing happens in
// ProviderDetailModal.
export function ProviderFormModal({
  opened,
  kindOptions,
  onSyncAccount,
  onClose,
}: ProviderFormModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('providers.modalCreate')}</DialogTitle>
        </DialogHeader>
        {/* Mounted with the dialog content, so every open starts from blank forms. */}
        <CreateProviderForm
          kindOptions={kindOptions}
          onSyncAccount={onSyncAccount}
          onDone={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateProviderForm({
  kindOptions,
  onSyncAccount,
  onDone,
}: {
  kindOptions: { value: string; label: string }[];
  onSyncAccount: (accountUuid: string) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateProvider();
  const identity = useForm<IdentityFormValues>({ defaultValues: EMPTY_IDENTITY });
  const account = useForm<AccountFormValues>({ defaultValues: EMPTY_ACCOUNT });
  const kind = identity.watch('kind');

  const submit = identity.handleSubmit(async (iv) => {
    if (!(await account.trigger())) return;
    const av = account.getValues();
    const err = validateAccountCredentials(iv.kind, av, t);
    if (err) {
      notifyError(err);
      return;
    }
    const iconName = canonicalTablerIconName(iv.iconName);
    try {
      const saved = await create.mutateAsync({
        name: iv.name,
        kind: iv.kind as ProviderKind,
        loginUrl: iv.loginUrl || undefined,
        ...(iconName ? { iconName, iconBg: iv.iconBg || DEFAULT_ICON_BG } : {}),
        account: { isPostpaid: av.isPostpaid, ...buildCredentials(iv.kind, av) },
      });
      notifySuccess(t('providers.created'));
      onDone();
      // Pull servers and balance right away so the owner sees whether the credentials work.
      const first = saved.accounts[0];
      if (saved.kind !== 'manual' && first) onSyncAccount(first.uuid);
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <ProviderIdentityFields form={identity} editing={false} kindOptions={kindOptions} />
      <ProviderAccountFields form={account} kind={kind} labelMode="hidden" />
      <Button type="submit" className="w-full" disabled={create.isPending}>
        {create.isPending && <IconLoader2 className="size-4 animate-spin" />}
        {t('common.save')}
      </Button>
    </form>
  );
}
