import { IconKey, IconServer2 } from '@tabler/icons-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormSection } from '@/components/FormSection';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProviderCredentialFields } from './ProviderCredentialFields';
import { DEFAULT_LOGIN_URLS, type FormValues } from './providerForm';

interface ProviderFormFieldsProps {
  form: UseFormReturn<FormValues>;
  editing: boolean;
  kindOptions: { value: string; label: string }[];
  // Passed in edit mode so Yandex discovery can reuse the stored key.
  providerUuid?: string;
}

// The provider form body, shared by the create modal and the detail modal (editing mode).
export function ProviderFormFields({
  form,
  editing,
  kindOptions,
  providerUuid,
}: ProviderFormFieldsProps) {
  const { t } = useTranslation();
  const nameError = form.formState.errors.name;
  const kind = form.watch('kind');
  return (
    <>
      <FormSection icon={IconServer2} title={t('providers.section.main')}>
        <div className="space-y-2">
          <Label htmlFor="provider-name">
            {t('providers.field.name')} <span className="text-destructive">*</span>
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
              <Select
                value={field.value}
                onValueChange={(v) => {
                  // Keep the cabinet link in sync with the kind until the owner types their own
                  // (the select is disabled when editing, so this only runs on create).
                  const url = form.getValues('loginUrl');
                  if (!url || url === DEFAULT_LOGIN_URLS[field.value]) {
                    form.setValue('loginUrl', DEFAULT_LOGIN_URLS[v] ?? '');
                  }
                  field.onChange(v);
                }}
                disabled={editing}
              >
                <SelectTrigger id="provider-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kindOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        <Controller
          control={form.control}
          name="isPostpaid"
          render={({ field }) => (
            <div className="flex items-start gap-2">
              <Checkbox
                id="provider-postpaid"
                checked={field.value}
                onCheckedChange={(c) => field.onChange(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="provider-postpaid">{t('providers.field.isPostpaid')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('providers.field.isPostpaidDesc')}
                </p>
              </div>
            </div>
          )}
        />
      </FormSection>

      {/* Manual providers have no credentials — skip the empty section shell. */}
      {kind !== 'manual' && (
        <FormSection icon={IconKey} title={t('providers.section.credentials')}>
          <ProviderCredentialFields form={form} editing={editing} providerUuid={providerUuid} />
        </FormSection>
      )}
    </>
  );
}
