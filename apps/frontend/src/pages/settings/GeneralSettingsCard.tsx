import { providerKindSupportsPaymentImport, type RateSource } from '@infra/shared';
import { IconAlertTriangle, IconInfoCircle, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useProviders } from '@/api/providers';
import { useSettings, useUpdateSettings } from '@/api/settings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CURRENCY_OPTIONS, useEnums } from '@/constants';
import { notifyError, notifySuccess } from '@/utils/notify';

interface SettingsForm {
  baseCurrency: string;
  syncIntervalHours: number;
  rateSource: string;
  forecastTariffBackfill: boolean;
  forecastTariffBackfillForce: boolean;
  forecastTariffBackfillFrom: string;
}

export function GeneralSettingsCard() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: settings } = useSettings();
  const { data: providers } = useProviders();
  const updateSettings = useUpdateSettings();

  const rateSourceOptions = [
    { value: 'cbr', label: enums.rateSourceLabel('cbr') },
    { value: 'manual', label: enums.rateSourceLabel('manual') },
  ];

  const paymentImportCounts = useMemo(() => {
    const list = providers ?? [];
    const total = list.length;
    const missing = list.filter((p) => !providerKindSupportsPaymentImport(p.kind)).length;
    return { total, missing };
  }, [providers]);

  const { control, register, handleSubmit, reset, watch } = useForm<SettingsForm>({
    defaultValues: {
      baseCurrency: 'RUB',
      syncIntervalHours: 6,
      rateSource: 'cbr',
      forecastTariffBackfill: false,
      forecastTariffBackfillForce: false,
      forecastTariffBackfillFrom: '',
    },
    mode: 'onSubmit',
  });
  const backfillOn = watch('forecastTariffBackfill');

  // Re-seed the form when settings load
  useEffect(() => {
    if (!settings) return;
    reset({
      baseCurrency: settings.baseCurrency,
      syncIntervalHours: settings.syncIntervalHours,
      rateSource: settings.rateSource,
      forecastTariffBackfill: settings.forecastTariffBackfill,
      forecastTariffBackfillForce: settings.forecastTariffBackfillForce,
      forecastTariffBackfillFrom: settings.forecastTariffBackfillFrom ?? '',
    });
  }, [settings, reset]);

  const saveSettings = handleSubmit(async (v) => {
    try {
      await updateSettings.mutateAsync({
        baseCurrency: v.baseCurrency,
        syncIntervalHours: v.syncIntervalHours,
        rateSource: v.rateSource as RateSource,
        forecastTariffBackfill: v.forecastTariffBackfill,
        forecastTariffBackfillForce: v.forecastTariffBackfillForce,
        forecastTariffBackfillFrom: v.forecastTariffBackfillFrom,
      });
      notifySuccess(t('settings.settingsSaved'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const showWarn = paymentImportCounts.total > 0 && paymentImportCounts.missing > 0 && !backfillOn;
  const showOk = paymentImportCounts.total > 0 && paymentImportCounts.missing === 0;

  return (
    <Card>
      <CardContent>
        <form onSubmit={saveSettings} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-base-currency">{t('settings.baseCurrency')}</Label>
            <Controller
              control={control}
              name="baseCurrency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="settings-base-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-sync-interval">{t('settings.syncInterval')}</Label>
            <Input
              id="settings-sync-interval"
              type="number"
              inputMode="numeric"
              min={1}
              max={168}
              {...register('syncIntervalHours', { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-rate-source">{t('settings.rateSource')}</Label>
            <Controller
              control={control}
              name="rateSource"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="settings-rate-source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rateSourceOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <p className="font-medium text-sm">{t('settings.forecast.title')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.forecast.description')}
              </p>
            </div>

            {showWarn && (
              <Alert className="border-warning/30 bg-warning/10 text-warning [&>svg]:text-warning">
                <IconAlertTriangle className="size-4.5" />
                <AlertDescription className="text-warning">
                  {t('settings.forecast.paymentImportWarn', {
                    missing: paymentImportCounts.missing,
                    total: paymentImportCounts.total,
                  })}
                </AlertDescription>
              </Alert>
            )}
            {showOk && (
              <Alert>
                <IconInfoCircle className="size-4.5" />
                <AlertDescription>
                  {t('settings.forecast.paymentImportOk', {
                    total: paymentImportCounts.total,
                  })}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-start gap-3">
              <Controller
                control={control}
                name="forecastTariffBackfill"
                render={({ field }) => (
                  <Switch
                    id="settings-forecast-backfill"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                )}
              />
              <div className="space-y-1">
                <Label htmlFor="settings-forecast-backfill">
                  {t('settings.forecast.backfill')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.forecast.backfillDescription')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Controller
                control={control}
                name="forecastTariffBackfillForce"
                render={({ field }) => (
                  <Switch
                    id="settings-forecast-force"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                )}
              />
              <div className="space-y-1">
                <Label htmlFor="settings-forecast-force">{t('settings.forecast.force')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.forecast.forceDescription')}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-forecast-from">{t('settings.forecast.from')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.forecast.fromDescription')}
              </p>
              <Input
                id="settings-forecast-from"
                type="month"
                {...register('forecastTariffBackfillFrom')}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending && <IconLoader2 className="size-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
