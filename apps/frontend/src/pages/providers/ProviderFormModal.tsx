import { IconLoader2 } from '@tabler/icons-react';
import type { FormEventHandler } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProviderFormFields } from './ProviderFormFields';
import type { FormValues } from './providerForm';

interface ProviderFormModalProps {
  opened: boolean;
  form: UseFormReturn<FormValues>;
  kindOptions: { value: string; label: string }[];
  isPending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
}

// Create-only modal; editing happens in ProviderDetailModal.
export function ProviderFormModal({
  opened,
  form,
  kindOptions,
  isPending,
  onSubmit,
  onClose,
}: ProviderFormModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('providers.modalCreate')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <ProviderFormFields form={form} editing={false} kindOptions={kindOptions} />
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <IconLoader2 className="size-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
