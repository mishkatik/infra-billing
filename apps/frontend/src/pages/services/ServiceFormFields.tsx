import type { Service } from '@infra/shared';
import { IconCalendarDollar, IconStack2 } from '@tabler/icons-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CountryCombobox } from '@/components/CountryCombobox';
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
import { normalizeMoney, trimMoney } from '@/utils/format';
import { OverriddenMark } from './OverriddenMark';
import type { SForm } from './serviceForm';

function metaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === 'string' ? v : undefined;
}

/** Pencil when the value leaves the provider baseline (or the loaded value before first sync). */
function showOverrideMark(
  current: string,
  loaded: string,
  savedOverridden: boolean,
  synced: string | undefined,
): boolean {
  if (synced != null) return current !== synced;
  if (savedOverridden) return true;
  return current !== loaded;
}

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
    watch,
    formState: { errors, defaultValues },
  } = form;
  const name = watch('name');
  const type = watch('type');
  const cost = watch('cost');
  const syncedName = metaString(editing?.meta, 'syncedName');
  const syncedType = metaString(editing?.meta, 'syncedType');
  const syncedCost = metaString(editing?.meta, 'syncedCost');
  const showNameMark = Boolean(
    editing &&
      showOverrideMark(name, defaultValues?.name ?? '', editing.nameOverridden, syncedName),
  );
  const showTypeMark = Boolean(
    editing &&
      showOverrideMark(type, defaultValues?.type ?? '', editing.typeOverridden, syncedType),
  );
  const loadedCost = trimMoney(String(defaultValues?.cost ?? ''));
  const baselineCost = syncedCost != null ? trimMoney(syncedCost) : loadedCost;
  // Compare in canonical form so "10.5" doesn't read as an edit of a "10.50" baseline.
  const showCostMark = Boolean(
    editing &&
      showOverrideMark(
        normalizeMoney(cost),
        normalizeMoney(loadedCost),
        editing.costOverridden,
        syncedCost != null ? normalizeMoney(syncedCost) : undefined,
      ),
  );
  const restoreOpts = { shouldDirty: true, shouldValidate: true } as const;

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
          <div className="flex h-4 items-center gap-1">
            <Label htmlFor="service-name">
              {t('services.fieldName')} <span className="text-destructive">*</span>
            </Label>
            {showNameMark && (
              <OverriddenMark
                label={t('services.detail.nameOverridden')}
                onRestore={() =>
                  setValue('name', syncedName ?? defaultValues?.name ?? '', restoreOpts)
                }
              />
            )}
          </div>
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
          <div className="min-w-0 space-y-2">
            <div className="flex h-4 items-center gap-1">
              <Label htmlFor="service-type">{t('services.fieldType')}</Label>
              {showTypeMark && (
                <OverriddenMark
                  label={t('services.detail.typeOverridden')}
                  onRestore={() =>
                    setValue('type', syncedType ?? defaultValues?.type ?? '', restoreOpts)
                  }
                />
              )}
            </div>
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
          <div className="min-w-0 space-y-2">
            <div className="flex h-4 items-center gap-1">
              <Label htmlFor="service-period">{t('services.fieldPeriod')}</Label>
            </div>
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
          <div className="min-w-0 space-y-2">
            <div className="flex h-4 items-center gap-1">
              <Label htmlFor="service-cost">
                {t('services.fieldCost')} <span className="text-destructive">*</span>
              </Label>
              {showCostMark && (
                <OverriddenMark
                  label={t('services.detail.costOverridden')}
                  onRestore={() => setValue('cost', baselineCost, restoreOpts)}
                />
              )}
            </div>
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
          <div className="min-w-0 space-y-2">
            <div className="flex h-4 items-center gap-1">
              <Label htmlFor="service-currency">{t('services.fieldCurrency')}</Label>
            </div>
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
          <div className="min-w-0 space-y-2">
            <div className="flex h-4 items-center gap-1">
              <Label htmlFor="service-country">{t('services.fieldCountry')}</Label>
            </div>
            <Controller
              control={control}
              name="countryCode"
              render={({ field }) => (
                <CountryCombobox
                  id="service-country"
                  value={field.value}
                  onChange={field.onChange}
                  options={countryOptions}
                  placeholder={t('services.countryPlaceholder')}
                />
              )}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex h-4 items-center gap-1">
              <Label htmlFor="service-next-billing">{t('services.fieldNextBilling')}</Label>
            </div>
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
