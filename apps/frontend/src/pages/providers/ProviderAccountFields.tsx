import { IconKey, IconUserCircle } from '@tabler/icons-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormSection } from '@/components/FormSection';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProviderCredentialFields } from './ProviderCredentialFields';
import {
  type AccountFormValues,
  type StoredSecretFlags,
  validateAccountLabel,
} from './providerForm';

interface ProviderAccountFieldsProps {
  form: UseFormReturn<AccountFormValues>;
  kind: string;
  /** `hidden` for a provider's first account, `optional` for the unlabelled original. */
  labelMode: 'hidden' | 'optional' | 'required';
  /** Labels of the provider's other accounts, for the uniqueness check. */
  otherLabels?: (string | null)[];
  accountUuid?: string;
  storedSecrets?: StoredSecretFlags;
}

// One account's settings: label, postpaid flag and the credentials for the provider kind.
export function ProviderAccountFields({
  form,
  kind,
  labelMode,
  otherLabels = [],
  accountUuid,
  storedSecrets,
}: ProviderAccountFieldsProps) {
  const { t } = useTranslation();
  const labelError = form.formState.errors.label;
  return (
    <>
      <FormSection icon={IconUserCircle} title={t('providers.account.section')}>
        {labelMode !== 'hidden' && (
          <div className="space-y-2">
            <Label htmlFor="account-label">
              {t('providers.account.label')}
              {labelMode === 'required' && <span className="text-ink-3"> *</span>}
            </Label>
            <p className="text-xs text-muted-foreground">{t('providers.account.labelDesc')}</p>
            <Input
              id="account-label"
              placeholder={labelMode === 'optional' ? t('common.accountMain') : undefined}
              aria-invalid={labelError ? true : undefined}
              {...form.register('label', {
                validate: (v) =>
                  validateAccountLabel(v, t, { required: labelMode === 'required', otherLabels }),
              })}
            />
            {labelError && <p className="text-xs text-destructive">{labelError.message}</p>}
          </div>
        )}
        <Controller
          control={form.control}
          name="isPostpaid"
          render={({ field }) => (
            <div className="flex items-start gap-2">
              <Checkbox
                id="account-postpaid"
                checked={field.value}
                onCheckedChange={(c) => field.onChange(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="account-postpaid">{t('providers.field.isPostpaid')}</Label>
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
          {/* Keyed by account and kind: switching remounts the inputs, so a reveal still in
              flight for another account can never resolve into this form. */}
          <ProviderCredentialFields
            key={`${accountUuid ?? 'new'}:${kind}`}
            form={form}
            kind={kind}
            accountUuid={accountUuid}
            storedSecrets={storedSecrets}
          />
        </FormSection>
      )}
    </>
  );
}
