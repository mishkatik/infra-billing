import type { Provider } from '@infra/shared';
import { useQueries } from '@tanstack/react-query';
import { IconArrowMerge, IconExternalLink, IconLoader2, IconTrash } from '@tabler/icons-react';
import { type ReactNode, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { accountSpendQuery } from '@/api/analytics';
import { useDeleteProvider, useUpdateProvider } from '@/api/providers';
import { ProviderIcon } from '@/components/ProviderIcon';
import { DEFAULT_ICON_BG, canonicalTablerIconName } from '@/components/tablerIconCatalog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { providerFavicon } from '@/utils/favicon';
import { formatDate, formatMoney } from '@/utils/format';
import { sumMoney } from '@/utils/money';
import { notifyError, notifySuccess } from '@/utils/notify';
import { MergeProviderDialog } from './MergeProviderDialog';
import { ProviderAccountModal } from './ProviderAccountModal';
import { ProviderAccountsSection } from './ProviderAccountsSection';
import { ProviderIdentityFields } from './ProviderIdentityFields';
import { type IdentityFormValues, identityFormFrom } from './providerForm';

interface ProviderDetailModalProps {
  provider: Provider | null;
  /** Every provider, for the merge target list. */
  providers: Provider[];
  /** Account card to bring into view (deep link ?account=). */
  focusAccountUuid: string | null;
  kindOptions: { value: string; label: string }[];
  kindLabel: (kind: string) => string;
  onSyncAccount: (accountUuid: string) => void;
  /** Switch the modal to another provider (the merge target). */
  onOpenProvider: (uuid: string) => void;
  onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

// The provider's spend over the last 30 days, one line per currency. Reads the same cached queries
// as the account cards; "≈" when any account is estimated or covers only part of the month.
function SpentRow({ provider }: { provider: Provider }) {
  const { t } = useTranslation();
  const results = useQueries({
    queries: provider.accounts.map((a) => accountSpendQuery(a.uuid)),
  });
  const byCurrency = new Map<string, { amounts: string[]; approx: boolean }>();
  for (const { data } of results) {
    if (data?.source == null || data.currency == null || data.last30d == null) continue;
    const entry = byCurrency.get(data.currency) ?? { amounts: [], approx: false };
    entry.amounts.push(data.last30d);
    entry.approx ||= data.approximate || data.coveredDays < 30;
    byCurrency.set(data.currency, entry);
  }
  if (byCurrency.size === 0) return null;
  return (
    <InfoRow
      label={t('providers.spend.detailRow')}
      value={[...byCurrency].map(([currency, { amounts, approx }]) => (
        <span key={currency} className="block">
          {approx && '≈ '}
          {formatMoney(sumMoney(amounts), currency)}
        </span>
      ))}
    />
  );
}

// Provider details: the identity form and totals on top, the accounts below.
export function ProviderDetailModal({ provider, ...rest }: ProviderDetailModalProps) {
  // The parent nulls `provider` right on close while Radix is still playing the exit animation —
  // without this "memory" the content visibly collapses to an empty shell. Show the last provider.
  const lastProvider = useRef<Provider | null>(provider);
  if (provider) lastProvider.current = provider;
  const shown = provider ?? lastProvider.current;
  if (shown == null) return null;

  return (
    <Dialog open={!!provider} onOpenChange={(o) => !o && rest.onClose()}>
      {/* No autofocus — otherwise the focus ring lights up on the first input right away. */}
      <DialogContent
        className="grid max-h-[85vh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-4xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Mounted with the dialog content and keyed by provider, so the form starts from the
            stored identity on every open and when a merge switches to the target. */}
        <DetailBody key={shown.uuid} provider={shown} {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({
  provider,
  providers,
  focusAccountUuid,
  kindOptions,
  kindLabel,
  onSyncAccount,
  onOpenProvider,
  onClose,
}: Omit<ProviderDetailModalProps, 'provider'> & { provider: Provider }) {
  const { t } = useTranslation();
  const update = useUpdateProvider();
  const del = useDeleteProvider();
  const form = useForm<IdentityFormValues>({ defaultValues: identityFormFrom(provider) });
  // `open` is kept apart from the target so the dialogs keep their content while closing.
  const [accountModal, setAccountModal] = useState<{ open: boolean; uuid: string | null }>({
    open: false,
    uuid: null,
  });
  const [mergeOpen, setMergeOpen] = useState(false);
  const editedAccount = provider.accounts.find((a) => a.uuid === accountModal.uuid) ?? null;

  const submit = form.handleSubmit(async (v) => {
    const iconName = canonicalTablerIconName(v.iconName);
    try {
      await update.mutateAsync({
        uuid: provider.uuid,
        dto: {
          name: v.name,
          loginUrl: v.loginUrl || null,
          ...(iconName
            ? { iconName, iconBg: v.iconBg || DEFAULT_ICON_BG }
            : { iconName: null, iconBg: null }),
        },
      });
      notifySuccess(t('providers.updated'));
      onClose();
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const remove = async () => {
    if (!window.confirm(t('providers.confirmDelete', { name: provider.name }))) return;
    try {
      await del.mutateAsync(provider.uuid);
      notifySuccess(t('common.deleted'));
      onClose();
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <>
      <DialogHeader className="border-b border-hairline py-4 pr-14 pl-6">
        <DialogTitle className="flex flex-wrap items-center gap-3">
          <ProviderIcon
            name={provider.name}
            src={providerFavicon(provider)}
            iconName={provider.iconName}
            iconBg={provider.iconBg}
            size={28}
          />
          <span>{provider.name}</span>
          <Badge variant="secondary" className="font-mono">
            {kindLabel(provider.kind)}
          </Badge>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-8 overflow-y-auto px-6 py-6">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
          <form id="provider-detail-form" onSubmit={submit} className="space-y-4">
            <ProviderIdentityFields form={form} editing kindOptions={kindOptions} />
          </form>

          <section className="h-fit space-y-3 rounded-lg bg-background p-4">
            <p className="section-label">{t('providers.detail.infoTitle')}</p>
            <InfoRow
              label={t('providers.th.balance')}
              value={
                provider.balances.length > 0
                  ? provider.balances.map((b) => (
                      <span key={b.currency} className="block">
                        {formatMoney(b.amount, b.currency)}
                      </span>
                    ))
                  : '—'
              }
            />
            <SpentRow provider={provider} />
            <InfoRow label={t('providers.account.title')} value={provider.accounts.length} />
            <InfoRow label={t('providers.detail.services')} value={provider.servicesCount} />
            <InfoRow label={t('providers.detail.payments')} value={provider.paymentsCount} />
            <InfoRow label={t('providers.detail.created')} value={formatDate(provider.createdAt)} />
            <InfoRow label={t('providers.detail.updated')} value={formatDate(provider.updatedAt)} />
          </section>
        </div>

        <ProviderAccountsSection
          provider={provider}
          focusAccountUuid={focusAccountUuid}
          onSyncAccount={onSyncAccount}
          onAdd={() => setAccountModal({ open: true, uuid: null })}
          onEdit={(a) => setAccountModal({ open: true, uuid: a.uuid })}
        />
      </div>

      <DialogFooter className="flex-row flex-wrap items-center gap-1.5 border-t border-hairline px-6 py-4 sm:justify-between">
        <div className="flex flex-1 items-center gap-1">
          {provider.loginUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('providers.detail.openLk')}
                >
                  <a href={provider.loginUrl} target="_blank" rel="noreferrer">
                    <IconExternalLink className="size-4" stroke={1.5} />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('providers.detail.openLk')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:text-destructive"
                aria-label={t('common.delete')}
                disabled={del.isPending}
                onClick={remove}
              >
                <IconTrash className="size-4" stroke={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('common.delete')}</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => setMergeOpen(true)}>
            <IconArrowMerge className="size-3.5" stroke={1.5} />
            {t('providers.merge.action')}
          </Button>
        </div>
        <Button type="submit" form="provider-detail-form" disabled={update.isPending}>
          {update.isPending && <IconLoader2 className="size-4 animate-spin" />}
          {t('common.save')}
        </Button>
      </DialogFooter>

      {/* Nested in this dialog's tree so Radix stacks them above it. */}
      <ProviderAccountModal
        opened={accountModal.open}
        provider={provider}
        account={editedAccount}
        onSyncAccount={onSyncAccount}
        onClose={() => setAccountModal((s) => ({ ...s, open: false }))}
      />
      <MergeProviderDialog
        opened={mergeOpen}
        source={provider}
        providers={providers}
        kindLabel={kindLabel}
        onMerged={(target) => {
          setMergeOpen(false);
          onOpenProvider(target.uuid);
        }}
        onClose={() => setMergeOpen(false)}
      />
    </>
  );
}
