import type { Service } from '@infra/shared';
import { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCost, formatDateShort } from '@/utils/format';

interface BumpNextBillingDialogProps {
  service: Service | null;
  /** ISO of the already-computed bumped date (period step applied by the caller). */
  nextDate: string | undefined;
  isPending: boolean;
  onConfirm: (withPayment: boolean) => void;
  onClose: () => void;
}

export function BumpNextBillingDialog({
  service,
  nextDate,
  isPending,
  onConfirm,
  onClose,
}: BumpNextBillingDialogProps) {
  const { t } = useTranslation();
  // The parent nulls `service` on close while the dialog is still fading out; keep showing the
  // last one so the text doesn't vanish and the box doesn't shrink mid-animation.
  const last = useRef({ service, nextDate });
  if (service) last.current = { service, nextDate };
  const shown = last.current;

  return (
    <Dialog open={!!service} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('services.bumpTitle')}</DialogTitle>
          <DialogDescription>
            {shown.service && (
              <Trans
                i18nKey="services.bumpText"
                values={{
                  date: formatDateShort(shown.nextDate),
                  amount: formatCost(shown.service.cost, shown.service.currency),
                }}
                components={{ mono: <span className="text-foreground" /> }}
              />
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row flex-wrap gap-1.5 sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" onClick={() => onConfirm(false)} disabled={isPending}>
            {t('services.bumpOnly')}
          </Button>
          <Button onClick={() => onConfirm(true)} disabled={isPending}>
            {t('services.bumpWithPayment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
