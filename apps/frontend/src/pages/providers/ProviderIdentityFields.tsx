import { IconServer2 } from '@tabler/icons-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormSection } from '@/components/FormSection';
import { IconAppearanceFields } from '@/components/IconAppearanceFields';
import { DEFAULT_ICON_BG, resolveTablerIcon } from '@/components/tablerIconCatalog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProviderKindPicker } from './ProviderKindPicker';
import { DEFAULT_LOGIN_URLS, type IdentityFormValues } from './providerForm';

interface ProviderIdentityFieldsProps {
  form: UseFormReturn<IdentityFormValues>;
  editing: boolean;
  kindOptions: { value: string; label: string }[];
}

// The hoster identity (name, kind, cabinet link, icon), shared by the create modal and the
// detail modal. Account settings and credentials live in ProviderAccountFields.
export function ProviderIdentityFields({
  form,
  editing,
  kindOptions,
}: ProviderIdentityFieldsProps) {
  const { t } = useTranslation();
  const nameError = form.formState.errors.name;
  const previewName = form.watch('name');
  const iconName = form.watch('iconName');
  const iconBg = form.watch('iconBg');
  const HeaderIcon = resolveTablerIcon(iconName) ?? IconServer2;
  return (
    <FormSection
      icon={HeaderIcon}
      iconBg={iconName ? iconBg || DEFAULT_ICON_BG : null}
      title={t('providers.section.main')}
    >
      <div className="space-y-2">
        <Label htmlFor="provider-name">
          {t('providers.field.name')} <span className="text-ink-3">*</span>
        </Label>
        <Input
          id="provider-name"
          aria-invalid={nameError ? true : undefined}
          {...form.register('name', {
            validate: (v) => (v.trim() ? true : t('validation.enterName')),
          })}
        />
        {nameError && <p className="text-xs text-destructive">{nameError.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider-kind">{t('providers.field.type')}</Label>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <ProviderKindPicker
              id="provider-kind"
              value={field.value}
              options={kindOptions}
              disabled={editing}
              onChange={(v) => {
                // Keep the cabinet link in sync with the kind until the owner types their own
                // (the picker is disabled when editing, so this only runs on create).
                const url = form.getValues('loginUrl');
                if (!url || url === DEFAULT_LOGIN_URLS[field.value]) {
                  form.setValue('loginUrl', DEFAULT_LOGIN_URLS[v] ?? '');
                }
                field.onChange(v);
              }}
            />
          )}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="provider-login-url">{t('providers.field.loginUrl')}</Label>
        <p className="text-xs text-muted-foreground">{t('providers.field.loginUrlDesc')}</p>
        <Input
          id="provider-login-url"
          placeholder="https://my.example.com"
          aria-invalid={form.formState.errors.loginUrl ? true : undefined}
          {...form.register('loginUrl', {
            // The backend rejects non-URLs with an opaque 400 — explain it before submit.
            validate: (v) => {
              if (!v.trim()) return true;
              try {
                const u = new URL(v);
                if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
                return true;
              } catch {
                return t('providers.err.loginUrlInvalid');
              }
            },
          })}
        />
        {form.formState.errors.loginUrl && (
          <p className="text-xs text-destructive">{form.formState.errors.loginUrl.message}</p>
        )}
      </div>
      <IconAppearanceFields
        previewName={previewName}
        iconName={iconName}
        iconBg={iconBg}
        onIconNameChange={(v) => form.setValue('iconName', v, { shouldDirty: true })}
        onIconBgChange={(v) => form.setValue('iconBg', v, { shouldDirty: true })}
      />
    </FormSection>
  );
}
