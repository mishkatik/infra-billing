import type { Provider, ProviderAccount } from '@infra/shared';
import { IconLoader2 } from '@tabler/icons-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useCreateProviderAccount, useUpdateProviderAccount } from '@/api/providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyError, notifySuccess } from '@/utils/notify';
import { ProviderAccountFields } from './ProviderAccountFields';
import {
  type AccountFormValues,
  accountFormFrom,
  buildCredentials,
  newAccountForm,
  validateAccountCredentials,
} from './providerForm';

interface ProviderAccountModalProps {
  opened: boolean;
  provider: Provider;
  /** The account being edited; null adds a new one. */
  account: ProviderAccount | null;
  onSyncAccount: (accountUuid: string) => void;
  onClose: () => void;
}

// Add or edit one account of a provider: label, postpaid flag and credentials.
export function ProviderAccountModal({
  opened,
  provider,
  account,
  onSyncAccount,
  onClose,
}: ProviderAccountModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto"
        onOpenAutoFocus={(e) => account && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {account ? t('providers.account.modalEdit') : t('providers.account.modalAdd')}
            <span className="ml-2 font-normal text-ink-2">{provider.name}</span>
          </DialogTitle>
        </DialogHeader>
        {/* Mounted with the dialog content and keyed by account, so each open starts fresh. */}
        <AccountForm
          key={account?.uuid ?? 'new'}
          provider={provider}
          account={account}
          onSyncAccount={onSyncAccount}
          onDone={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({
  provider,
  account,
  onSyncAccount,
  onDone,
}: {
  provider: Provider;
  account: ProviderAccount | null;
  onSyncAccount: (accountUuid: string) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateProviderAccount();
  const update = useUpdateProviderAccount();
  const form = useForm<AccountFormValues>({
    defaultValues: account ? accountFormFrom(account) : newAccountForm(provider),
  });
  const otherLabels = provider.accounts.filter((a) => a.uuid !== account?.uuid).map((a) => a.label);
  // The original account may stay unlabelled ("main"); every added one needs a label.
  const labelMode = account && account.label == null ? 'optional' : 'required';

  const submit = form.handleSubmit(async (v) => {
    const err = validateAccountCredentials(provider.kind, v, t, { requireCreds: !account });
    if (err) {
      notifyError(err);
      return;
    }
    const creds = buildCredentials(provider.kind, v);
    const label = v.label.trim();
    try {
      let saved: ProviderAccount;
      if (account) {
        saved = await update.mutateAsync({
          uuid: account.uuid,
          dto: { label: label || null, isPostpaid: v.isPostpaid, ...creds },
        });
        notifySuccess(t('providers.account.updated'));
      } else {
        saved = await create.mutateAsync({
          providerUuid: provider.uuid,
          dto: { label, isPostpaid: v.isPostpaid, ...creds },
        });
        notifySuccess(t('providers.account.created'));
      }
      onDone();
      // Credential changes take effect right away (not for a switched-off account: its sync
      // endpoint answers 400).
      if (provider.kind !== 'manual' && saved.isEnabled) onSyncAccount(saved.uuid);
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const pending = create.isPending || update.isPending;
  return (
    <form onSubmit={submit} className="space-y-4">
      <ProviderAccountFields
        form={form}
        kind={provider.kind}
        labelMode={labelMode}
        otherLabels={otherLabels}
        accountUuid={account?.uuid}
        storedSecrets={account ?? undefined}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <IconLoader2 className="size-4 animate-spin" />}
        {t('common.save')}
      </Button>
    </form>
  );
}
