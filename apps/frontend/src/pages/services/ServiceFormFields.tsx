import type { Service } from '@infra/shared';
import { IconCalendarDollar, IconStack2 } from '@tabler/icons-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CountryCombobox } from '@/components/CountryCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
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
import { ServiceMarkerField } from './ServiceMarkerField';
import { LOCATED_TYPES } from './ServiceTypeIcon';
import { LLM_VENDOR_OPTIONS, vendorFromModelSlug } from './llmVendorIcon';
import { metaString, type SForm } from './serviceForm';

const TYPE_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._/-]{0,39}$/u;

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
  onTypeCreated?: (type: string) => void;
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
  onTypeCreated,
}: ServiceFormFieldsProps) {
  const { t } = useTranslation();
  const {
    register,
    control,
    setValue,
    getValues,
    watch,
    formState: { errors, defaultValues },
  } = form;
  const name = watch('name');
  const type = watch('type');
  const cost = watch('cost');
  const syncedName = metaString(editing?.meta, 'syncedName') || undefined;
  const syncedType = metaString(editing?.meta, 'syncedType') || undefined;
  const syncedCost = metaString(editing?.meta, 'syncedCost') || undefined;
  const marker = watch('marker');
  const markerBg = watch('markerBg');
  const vendor = watch('vendor');
  const syncedVendor =
    metaString(editing?.meta, 'syncedVendor') ||
    vendorFromModelSlug(metaString(editing?.meta, 'model')) ||
    undefined;
  const restoreOpts = { shouldDirty: true, shouldValidate: true } as const;
  const showNameMark = Boolean(
    editing &&
      showOverrideMark(name, defaultValues?.name ?? '', editing.nameOverridden, syncedName),
  );
  const showTypeMark = Boolean(
    editing &&
      showOverrideMark(type, defaultValues?.type ?? '', editing.typeOverridden, syncedType),
  );
  const showVendorMark = Boolean(
    editing &&
      type === 'llm' &&
      showOverrideMark(vendor.trim(), (defaultValues?.vendor ?? '').trim(), false, syncedVendor),
  );

  const countryBaseline = () => {
    const synced = metaString(editing?.meta, 'syncedCountry');
    if (synced && synced !== 'XX') return synced;
    if (editing?.countryCode && editing.countryCode !== 'XX') return editing.countryCode;
    const loaded = defaultValues?.countryCode ?? '';
    return loaded && loaded !== 'XX' ? loaded : '';
  };

  const applyTypeSideEffects = (next: string) => {
    if (LOCATED_TYPES.has(next)) {
      setValue('vendor', '', restoreOpts);
      setValue('marker', '', restoreOpts);
      setValue('markerBg', '', restoreOpts);
      const current = getValues('countryCode');
      if (!current || current === 'XX') {
        const baseline = countryBaseline();
        if (baseline) setValue('countryCode', baseline, restoreOpts);
      }
    } else if (next === 'llm') {
      setValue('marker', '', restoreOpts);
      setValue('markerBg', '', restoreOpts);
    } else {
      setValue('vendor', '', restoreOpts);
    }
  };

  const restoreType = () => {
    const next = syncedType ?? defaultValues?.type ?? '';
    setValue('type', next, restoreOpts);
    applyTypeSideEffects(next);
    if (LOCATED_TYPES.has(next)) {
      const baseline = countryBaseline();
      if (baseline) setValue('countryCode', baseline, restoreOpts);
    }
  };
  const loadedCost = trimMoney(String(defaultValues?.cost ?? ''));
  const baselineCost = syncedCost != null ? trimMoney(syncedCost) : loadedCost;
  const showCostMark = Boolean(
    editing &&
      showOverrideMark(
        normalizeMoney(cost),
        normalizeMoney(loadedCost),
        editing.costOverridden,
        syncedCost != null ? normalizeMoney(syncedCost) : undefined,
      ),
  );

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

        <div className="space-y-2">
          <Label htmlFor="service-description">{t('services.fieldDescription')}</Label>
          <Input
            id="service-description"
            maxLength={500}
            placeholder={t('services.descriptionPlaceholder')}
            {...register('description')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex h-4 items-center gap-1">
              <Label htmlFor="service-type">{t('services.fieldType')}</Label>
              {showTypeMark && (
                <OverriddenMark
                  label={t('services.detail.typeOverridden')}
                  onRestore={restoreType}
                />
              )}
            </div>
            <Controller
              control={control}
              name="type"
              rules={{
                validate: (v) =>
                  TYPE_RE.test(v.trim()) ? true : t('validation.serviceTypeInvalid'),
              }}
              render={({ field }) => (
                <CreatableCombobox
                  id="service-type"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    applyTypeSideEffects(v);
                  }}
                  onCreate={onTypeCreated}
                  options={typeOptions}
                />
              )}
            />
            {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
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
            {LOCATED_TYPES.has(type) ? (
              <>
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
              </>
            ) : type === 'llm' ? (
              <>
                <div className="flex h-4 items-center gap-1">
                  <Label htmlFor="service-vendor">{t('services.fieldVendor')}</Label>
                  {showVendorMark && (
                    <OverriddenMark
                      label={t('services.detail.vendorOverridden')}
                      onRestore={() =>
                        setValue('vendor', syncedVendor ?? defaultValues?.vendor ?? '', restoreOpts)
                      }
                    />
                  )}
                </div>
                <Controller
                  control={control}
                  name="vendor"
                  render={({ field }) => (
                    <CreatableCombobox
                      id="service-vendor"
                      value={field.value}
                      onChange={field.onChange}
                      options={LLM_VENDOR_OPTIONS}
                      placeholder={t('services.vendorPlaceholder')}
                    />
                  )}
                />
              </>
            ) : (
              <>
                <div className="flex h-4 items-center gap-1">
                  <Label htmlFor="service-marker">{t('services.fieldMarker')}</Label>
                </div>
                <ServiceMarkerField
                  id="service-marker"
                  marker={marker}
                  markerBg={markerBg}
                  onMarkerChange={(v) => setValue('marker', v, restoreOpts)}
                  onMarkerBgChange={(v) => setValue('markerBg', v, restoreOpts)}
                />
              </>
            )}
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
