import type { Service } from '@infra/shared';
import { useTranslation } from 'react-i18next';
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
  return (
    <Dialog open={!!service} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('services.bumpTitle')}</DialogTitle>
          <DialogDescription>
            {service &&
              t('services.bumpText', {
                date: formatDateShort(nextDate),
                amount: formatCost(service.cost, service.currency),
              })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row flex-wrap gap-1.5 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="secondary" onClick={() => onConfirm(false)} disabled={isPending}>
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
