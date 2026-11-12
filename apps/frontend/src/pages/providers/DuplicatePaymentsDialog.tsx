import { DUPLICATE_PAYMENT_WINDOW_DAYS, type DuplicatePayment } from '@infra/shared';
import { IconLoader2, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useDuplicatePayments, useRemoveDuplicatePayments } from '@/api/providers';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate, formatDateShort, formatMoney } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';

interface DuplicatePaymentsDialogProps {
  opened: boolean;
  accountUuid: string;
  /** Provider (and account) name for the title. */
  name: string;
  onClose: () => void;
}

// Manual payments the account's import has since brought in too, e.g. top-ups typed in by hand
// before the connector could import them. Every pair starts ticked; the owner unticks the ones that
// are real and deletes the rest. Only the manual side is ever deleted.
export function DuplicatePaymentsDialog({
  opened,
  accountUuid,
  name,
  onClose,
}: DuplicatePaymentsDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('providers.duplicates.title', { name })}</DialogTitle>
          <DialogDescription>
            {t('providers.duplicates.intro', { days: DUPLICATE_PAYMENT_WINDOW_DAYS })}
          </DialogDescription>
        </DialogHeader>
        <DuplicatesList accountUuid={accountUuid} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function DuplicatesList({ accountUuid, onDone }: { accountUuid: string; onDone: () => void }) {
  const { t } = useTranslation();
  const query = useDuplicatePayments(accountUuid);
  const remove = useRemoveDuplicatePayments();
  const items = query.data?.items ?? [];
  // Unticked manual payments; everything found starts ticked.
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const chosen = items.map((p) => p.manual.uuid).filter((uuid) => !kept.has(uuid));

  const toggle = (uuid: string, ticked: boolean) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (ticked) next.delete(uuid);
      else next.add(uuid);
      return next;
    });

  const confirm = async () => {
    try {
      const { deleted } = await remove.mutateAsync({ accountUuid, paymentUuids: chosen });
      notifySuccess(t('providers.duplicates.done', { count: deleted }));
      onDone();
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  if (query.isLoading) return <p className="text-sm text-ink-2">{t('common.loading')}</p>;
  if (query.isError) {
    return <p className="text-sm text-destructive">{apiErrorMessage(query.error)}</p>;
  }
  if (items.length === 0) {
    return <p className="text-sm text-ink-2">{t('providers.duplicates.none')}</p>;
  }

  return (
    <>
      <ul className="-mx-1 max-h-[50vh] divide-y divide-hairline overflow-y-auto px-1 text-sm">
        {items.map((p) => (
          <DuplicateRow
            key={p.manual.uuid}
            pair={p}
            ticked={!kept.has(p.manual.uuid)}
            onToggle={(ticked) => toggle(p.manual.uuid, ticked)}
          />
        ))}
      </ul>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button disabled={chosen.length === 0 || remove.isPending} onClick={confirm}>
          {remove.isPending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconTrash className="size-4" stroke={1.5} />
          )}
          {t('providers.duplicates.confirm', { count: chosen.length })}
        </Button>
      </DialogFooter>
    </>
  );
}

function DuplicateRow({
  pair: { manual, imported },
  ticked,
  onToggle,
}: {
  pair: DuplicatePayment;
  ticked: boolean;
  onToggle: (ticked: boolean) => void;
}) {
  const { t } = useTranslation();
  const typeLabel = t(manual.type === 'charge' ? 'payments.typeCharge' : 'payments.typeTopup');
  const importedLine = [
    t('providers.duplicates.imported', { date: formatDate(imported.paymentDate) }),
    imported.description,
  ]
    .filter(Boolean)
    .join(' · ');
  const id = `duplicate-${manual.uuid}`;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={ticked}
        onCheckedChange={(v) => onToggle(v === true)}
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate">
            {formatDateShort(manual.paymentDate)} · {manual.description || typeLabel}
          </span>
          <span className="shrink-0">{formatMoney(manual.amount, manual.currency)}</span>
        </span>
        <span className="block truncate text-[13px] text-ink-2" title={importedLine}>
          {importedLine}
        </span>
      </label>
    </li>
  );
}
