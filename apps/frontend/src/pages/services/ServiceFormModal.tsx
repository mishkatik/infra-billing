import { IconLoader2 } from '@tabler/icons-react';
import type { FormEventHandler } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SForm } from './serviceForm';
import { ServiceFormFields } from './ServiceFormFields';

interface ServiceFormModalProps {
  opened: boolean;
  form: UseFormReturn<SForm>;
  isPending: boolean;
  providerOptions: { value: string; label: string }[];
  projectOptions: { value: string; label: string }[];
  typeOptions: { value: string; label: string }[];
  periodOptions: { value: string; label: string }[];
  currencyOptions: { value: string; label: string }[];
  countryOptions: { value: string; label: string }[];
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
}

// Create-only modal; editing an existing service happens in ServiceDetailModal.
export function ServiceFormModal({
  opened,
  form,
  isPending,
  providerOptions,
  projectOptions,
  typeOptions,
  periodOptions,
  currencyOptions,
  countryOptions,
  onSubmit,
  onClose,
}: ServiceFormModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('services.modalCreate')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <ServiceFormFields
            form={form}
            editing={null}
            providerOptions={providerOptions}
            projectOptions={projectOptions}
            typeOptions={typeOptions}
            periodOptions={periodOptions}
            currencyOptions={currencyOptions}
            countryOptions={countryOptions}
          />
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending && <IconLoader2 className="size-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
