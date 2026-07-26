import type { Project } from '@infra/shared';
import { IconLoader2 } from '@tabler/icons-react';
import type { FormEventHandler } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { IconAppearanceFields } from '@/components/IconAppearanceFields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ProjectFormValues {
  name: string;
  faviconLink: string;
  iconName: string;
  iconBg: string;
}

interface ProjectFormModalProps {
  opened: boolean;
  editing: Project | null;
  form: UseFormReturn<ProjectFormValues>;
  isPending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
}

export function ProjectFormModal({
  opened,
  editing,
  form,
  isPending,
  onSubmit,
  onClose,
}: ProjectFormModalProps) {
  const { t } = useTranslation();
  const nameError = form.formState.errors.name;
  const previewName = form.watch('name');
  const iconName = form.watch('iconName');
  const iconBg = form.watch('iconBg');
  return (
    <Dialog open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('projects.modalEdit') : t('projects.modalCreate')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">
              {t('projects.fieldName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project-name"
              placeholder={t('projects.namePlaceholder')}
              autoFocus
              aria-invalid={nameError ? true : undefined}
              {...form.register('name', {
                validate: (v) => (v.trim() ? true : t('validation.enterName')),
              })}
            />
            {nameError && <p className="text-xs text-destructive">{nameError.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-favicon">{t('projects.fieldFavicon')}</Label>
            <p className="text-xs text-muted-foreground">{t('projects.faviconHint')}</p>
            <Input
              id="project-favicon"
              placeholder={t('projects.faviconPlaceholder')}
              {...form.register('faviconLink')}
            />
          </div>
          <IconAppearanceFields
            previewName={previewName}
            iconName={iconName}
            iconBg={iconBg}
            onIconNameChange={(v) => form.setValue('iconName', v, { shouldDirty: true })}
            onIconBgChange={(v) => form.setValue('iconBg', v, { shouldDirty: true })}
          />
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <IconLoader2 className="size-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
