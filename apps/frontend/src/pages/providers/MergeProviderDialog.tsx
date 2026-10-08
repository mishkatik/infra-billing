import type { Provider } from '@infra/shared';
import { IconArrowMerge, IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useMergeProvider } from '@/api/providers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { notifyError, notifySuccess } from '@/utils/notify';

interface MergeProviderDialogProps {
  opened: boolean;
  source: Provider;
  providers: Provider[];
  kindLabel: (kind: string) => string;
  onMerged: (target: Provider) => void;
  onClose: () => void;
}

// Folds a duplicate provider into another one of the same kind. Spells out what moves over and
// what is lost before the owner confirms: the merge can't be undone.
export function MergeProviderDialog({
  opened,
  source,
  providers,
  kindLabel,
  onMerged,
  onClose,
}: MergeProviderDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('providers.merge.title', { name: source.name })}</DialogTitle>
          <DialogDescription>{t('providers.merge.intro')}</DialogDescription>
        </DialogHeader>
        <MergeForm
          source={source}
          providers={providers}
          kindLabel={kindLabel}
          onMerged={onMerged}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function MergeForm({
  source,
  providers,
  kindLabel,
  onMerged,
  onCancel,
}: Omit<MergeProviderDialogProps, 'opened' | 'onClose'> & { onCancel: () => void }) {
  const { t } = useTranslation();
  const merge = useMergeProvider();
  const targets = providers.filter((p) => p.uuid !== source.uuid && p.kind === source.kind);
  const [targetUuid, setTargetUuid] = useState('');
  const target = targets.find((p) => p.uuid === targetUuid) ?? null;

  const confirm = async () => {
    if (!target) return;
    try {
      const merged = await merge.mutateAsync({
        uuid: source.uuid,
        targetProviderUuid: target.uuid,
      });
      notifySuccess(t('providers.merge.done', { name: merged.name }));
      onMerged(merged);
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <>
      <div className="space-y-4 text-sm">
        <div className="space-y-2">
          <Label htmlFor="merge-target">{t('providers.merge.target')}</Label>
          {targets.length > 0 ? (
            <Select value={targetUuid} onValueChange={setTargetUuid}>
              <SelectTrigger id="merge-target" className="w-full">
                <SelectValue placeholder={t('providers.merge.targetPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {targets.map((p) => (
                  <SelectItem key={p.uuid} value={p.uuid}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-ink-2">
              {t('providers.merge.noTargets', { kind: kindLabel(source.kind) })}
            </p>
          )}
        </div>

        <section className="space-y-2 rounded-lg bg-background p-4">
          <p className="section-label">{t('providers.merge.movesTitle')}</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>{t('providers.merge.movesAccounts', { count: source.accounts.length })}</li>
            <li>{t('providers.merge.movesServices', { count: source.servicesCount })}</li>
            <li>{t('providers.merge.movesPayments', { count: source.paymentsCount })}</li>
            <li>{t('providers.merge.movesHistory')}</li>
          </ul>
          <p className="text-[13px] text-ink-2">
            {t('providers.merge.labelNote', { name: source.name })}
          </p>
        </section>

        <section className="space-y-2 rounded-lg bg-background p-4">
          <p className="section-label">{t('providers.merge.discardedTitle')}</p>
          <p>{t('providers.merge.discarded', { name: source.name })}</p>
        </section>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!target || merge.isPending} onClick={confirm}>
          {merge.isPending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconArrowMerge className="size-4" />
          )}
          {t('providers.merge.confirm', { name: source.name })}
        </Button>
      </DialogFooter>
    </>
  );
}
