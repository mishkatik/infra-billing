import type { Service } from '@infra/shared';
import { IconCalendarDollar, IconMapPin, IconStack2 } from '@tabler/icons-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DateField } from '@/components/DateField';
import { FormSection } from '@/components/FormSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trimMoney } from '@/utils/format';
import type { SForm } from './serviceForm';

// SelectItem forbids value="" — sentinel for the cleared country pick.
const NO_COUNTRY = 'none';

interface ServiceFormFieldsProps {
  form: UseFormReturn<SForm>;
  editing: Service | null;
  providerOptions: { value: string; label: string }[];
  projectOptions: { value: string; label: string }[];
  typeOptions: { value: string; label: string }[];
  periodOptions: { value: string; label: string }[];
  currencyOptions: { value: string; label: string }[];
  countryOptions: { value: string; label: string }[];
}

// The service form fields, shared between the create modal and the detail modal.
export function ServiceFormFields({
  form,
  editing,
  providerOptions,
  projectOptions,
  typeOptions,
  periodOptions,
  currencyOptions,
  countryOptions,
}: ServiceFormFieldsProps) {
  const { t } = useTranslation();
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = form;

  return (
    <>
      <FormSection icon={IconStack2} title={t('services.section.main')}>
        <div className="space-y-2">
          <Label htmlFor="service-provider">{t('services.fieldProvider')}</Label>
          <Controller
            control={control}
            name="providerUuid"
            rules={{ validate: (v) => (v ? true : t('validation.selectProvider')) }}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                // Synced services are matched by provider, so can't be reattached elsewhere.
                disabled={Boolean(editing?.isManaged)}
              >
                <SelectTrigger id="service-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {editing?.isManaged && (
            <p className="text-xs text-muted-foreground">{t('services.providerLockedHint')}</p>
          )}
          {errors.providerUuid && (
            <p className="text-xs text-destructive">{errors.providerUuid.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="service-project">{t('services.fieldProject')}</Label>
          <Controller
            control={control}
            name="projectUuid"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="service-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((o) => (
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
          <Label htmlFor="service-name">
            {t('services.fieldName')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="service-name"
            aria-invalid={!!errors.name}
            {...register('name', {
              validate: (v) => (v.trim() ? true : t('validation.enterName')),
            })}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="service-type">{t('services.fieldType')}</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="service-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((o) => (
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
            <Label htmlFor="service-period">{t('services.fieldPeriod')}</Label>
            <Controller
              control={control}
              name="period"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="service-period" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </FormSection>

      <FormSection icon={IconCalendarDollar} title={t('services.section.billing')}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="service-cost">
              {t('services.fieldCost')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="service-cost"
              aria-invalid={!!errors.cost}
              {...register('cost', {
                // Accept any number of decimals. Extra ones are trimmed to 2 (on blur + submit).
                validate: (v) => (/^\d+(\.\d+)?$/.test(v) ? true : t('validation.amountFormat')),
                onBlur: (e) => setValue('cost', trimMoney(e.target.value)),
              })}
            />
            {errors.cost && <p className="text-xs text-destructive">{errors.cost.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-currency">{t('services.fieldCurrency')}</Label>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="service-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="service-country">{t('services.fieldCountry')}</Label>
            <Controller
              control={control}
              name="countryCode"
              render={({ field }) => (
                <Select
                  value={field.value || NO_COUNTRY}
                  onValueChange={(v) => field.onChange(v === NO_COUNTRY ? '' : v)}
                >
                  <SelectTrigger id="service-country" className="w-full">
                    <IconMapPin className="size-4 shrink-0 opacity-60" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COUNTRY}>{t('services.countryPlaceholder')}</SelectItem>
                    {countryOptions.map((o) => (
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
            <Label htmlFor="service-next-billing">{t('services.fieldNextBilling')}</Label>
            <Controller
              control={control}
              name="nextBillingAt"
              render={({ field }) => (
                <DateField
                  id="service-next-billing"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('services.nextBillingPlaceholder')}
                  clearable
                />
              )}
            />
          </div>
        </div>
      </FormSection>
    </>
  );
}
