import type { Provider } from '@infra/shared';
import { IconExternalLink, IconLoader2, IconRefresh, IconTrash } from '@tabler/icons-react';
import { type FormEventHandler, type ReactNode, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/ProviderIcon';
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
import { BalanceHistoryChart } from './BalanceHistoryChart';
import { ProviderFormFields } from './ProviderFormFields';
import type { FormValues } from './providerForm';

interface ProviderDetailModalProps {
  provider: Provider | null;
  form: UseFormReturn<FormValues>;
  kindOptions: { value: string; label: string }[];
  kindLabel: (kind: string) => string;
  isSaving: boolean;
  isSyncing: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onSync: (uuid: string) => void;
  onDelete: (p: Provider) => void;
  onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

// Provider details: the edit form on the left, info/sync/balance-history panels on the right.
export function ProviderDetailModal({
  provider,
  form,
  kindOptions,
  kindLabel,
  isSaving,
  isSyncing,
  onSubmit,
  onSync,
  onDelete,
  onClose,
}: ProviderDetailModalProps) {
  const { t } = useTranslation();
  // The parent nulls `provider` right on close while Radix is still playing the exit animation —
  // without this "memory" the content visibly collapses to an empty shell. Show the last provider.
  const lastProvider = useRef<Provider | null>(provider);
  if (provider) lastProvider.current = provider;
  const shown = provider ?? lastProvider.current;
  if (shown == null) return null;

  return (
    <Dialog open={!!provider} onOpenChange={(o) => !o && onClose()}>
      {/* No autofocus — otherwise the focus ring lights up on the first input right away. */}
      <DialogContent
        className="grid max-h-[85vh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-4xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ProviderIcon name={shown.name} src={providerFavicon(shown)} />
            <span>{shown.name}</span>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {kindLabel(shown.kind)}
            </Badge>
            {shown.isPostpaid && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {t('providers.detail.postpaid')}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="-mr-1 overflow-y-auto pr-1">
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
            <form id="provider-detail-form" onSubmit={onSubmit} className="space-y-4">
              <ProviderFormFields
                form={form}
                editing
                kindOptions={kindOptions}
                providerUuid={shown.uuid}
              />
            </form>

            <div className="space-y-4">
              <section className="space-y-2 rounded-xl border p-4">
                <p className="section-label">{t('providers.detail.infoTitle')}</p>
                <InfoRow
                  label={t('providers.th.balance')}
                  value={formatMoney(shown.balance, shown.balanceCurrency)}
                />
                <InfoRow label={t('providers.detail.services')} value={shown.servicesCount ?? 0} />
                <InfoRow label={t('providers.detail.payments')} value={shown.paymentsCount ?? 0} />
                <InfoRow
                  label={t('providers.detail.created')}
                  value={formatDate(shown.createdAt)}
                />
                <InfoRow
                  label={t('providers.detail.updated')}
                  value={formatDate(shown.updatedAt)}
                />
              </section>

              {shown.kind !== 'manual' && (
                <section className="space-y-2 rounded-xl border p-4">
                  <p className="section-label">{t('providers.detail.syncTitle')}</p>
                  <InfoRow
                    label={t('providers.detail.lastSync')}
                    value={formatDate(shown.lastSyncAt)}
                  />
                  {shown.lastSyncError && (
                    <p className="break-words text-xs text-destructive">{shown.lastSyncError}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={isSyncing}
                    onClick={() => onSync(shown.uuid)}
                  >
                    {isSyncing ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : (
                      <IconRefresh className="size-4" />
                    )}
                    {t('providers.detail.syncNow')}
                  </Button>
                </section>
              )}

              {shown.balance != null && (
                <section className="space-y-2 rounded-xl border p-4">
                  <p className="section-label">{t('providers.detail.historyTitle')}</p>
                  <BalanceHistoryChart provider={shown} />
                </section>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row flex-wrap items-center gap-1.5 sm:justify-between">
          <div className="flex flex-1 items-center gap-1.5">
            {shown.loginUrl && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    aria-label={t('providers.detail.openLk')}
                  >
                    <a href={shown.loginUrl} target="_blank" rel="noreferrer">
                      <IconExternalLink className="size-4" />
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
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={t('common.delete')}
                  onClick={() => onDelete(shown)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.delete')}</TooltipContent>
            </Tooltip>
          </div>
          <Button type="submit" form="provider-detail-form" disabled={isSaving}>
            {isSaving && <IconLoader2 className="size-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
