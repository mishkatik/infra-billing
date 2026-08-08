import { providerKindSupportsPaymentImport } from '@infra/shared';
import { IconAlertTriangle, IconChartBar, IconInfoCircle, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useProviders } from '@/api/providers';
import { useSettings, useUpdateSettings } from '@/api/settings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { notifyError, notifySuccess } from '@/utils/notify';

interface ForecastForm {
  forecastTariffBackfill: boolean;
  forecastTariffBackfillRespectCreatedAt: boolean;
  forecastTariffBackfillBackdateFromPayments: boolean;
  forecastTariffBackfillForce: boolean;
}

function ForecastToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-3', disabled && 'opacity-45')}>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <Label htmlFor={id} className={cn(disabled && 'text-muted-foreground')}>
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function ForecastSettingsCard() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const { data: providers } = useProviders();
  const updateSettings = useUpdateSettings();

  const paymentImportCounts = useMemo(() => {
    const list = providers ?? [];
    const total = list.length;
    const missing = list.filter((p) => !providerKindSupportsPaymentImport(p.kind)).length;
    return { total, missing };
  }, [providers]);

  const { control, handleSubmit, reset, watch, setValue } = useForm<ForecastForm>({
    defaultValues: {
      forecastTariffBackfill: false,
      forecastTariffBackfillRespectCreatedAt: false,
      forecastTariffBackfillBackdateFromPayments: false,
      forecastTariffBackfillForce: false,
    },
    mode: 'onSubmit',
  });
  const backfillOn = watch('forecastTariffBackfill');
  const respectCreatedOn = watch('forecastTariffBackfillRespectCreatedAt');

  useEffect(() => {
    if (!settings) return;
    reset({
      forecastTariffBackfill: settings.forecastTariffBackfill,
      forecastTariffBackfillRespectCreatedAt: settings.forecastTariffBackfillRespectCreatedAt,
      forecastTariffBackfillBackdateFromPayments:
        settings.forecastTariffBackfillBackdateFromPayments,
      forecastTariffBackfillForce: settings.forecastTariffBackfillForce,
    });
  }, [settings, reset]);

  const saveForecast = handleSubmit(async (v) => {
    const backfill = v.forecastTariffBackfill;
    const respect = backfill && v.forecastTariffBackfillRespectCreatedAt;
    try {
      await updateSettings.mutateAsync({
        forecastTariffBackfill: backfill,
        forecastTariffBackfillRespectCreatedAt: respect,
        forecastTariffBackfillBackdateFromPayments:
          respect && v.forecastTariffBackfillBackdateFromPayments,
        forecastTariffBackfillForce: backfill && v.forecastTariffBackfillForce,
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
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <IconChartBar className="size-5" />
          {t('settings.forecast.title')}
        </CardTitle>
        <CardDescription>{t('settings.forecast.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={saveForecast} className="space-y-4">
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

          <div className="space-y-4">
            <Controller
              control={control}
              name="forecastTariffBackfill"
              render={({ field }) => (
                <ForecastToggle
                  id="settings-forecast-backfill"
                  label={t('settings.forecast.backfill')}
                  description={t('settings.forecast.backfillDescription')}
                  checked={field.value}
                  onCheckedChange={(on) => {
                    field.onChange(on);
                    if (!on) {
                      setValue('forecastTariffBackfillRespectCreatedAt', false);
                      setValue('forecastTariffBackfillBackdateFromPayments', false);
                      setValue('forecastTariffBackfillForce', false);
                    }
                  }}
                />
              )}
            />

            <Controller
              control={control}
              name="forecastTariffBackfillRespectCreatedAt"
              render={({ field }) => (
                <ForecastToggle
                  id="settings-forecast-respect-created"
                  label={t('settings.forecast.respectCreatedAt')}
                  description={t('settings.forecast.respectCreatedAtDescription')}
                  checked={field.value}
                  disabled={!backfillOn}
                  onCheckedChange={(on) => {
                    field.onChange(on);
                    if (!on) setValue('forecastTariffBackfillBackdateFromPayments', false);
                  }}
                />
              )}
            />

            <Controller
              control={control}
              name="forecastTariffBackfillBackdateFromPayments"
              render={({ field }) => (
                <ForecastToggle
                  id="settings-forecast-backdate"
                  label={t('settings.forecast.backdateFromPayments')}
                  description={t('settings.forecast.backdateFromPaymentsDescription')}
                  checked={field.value}
                  disabled={!backfillOn || !respectCreatedOn}
                  onCheckedChange={field.onChange}
                />
              )}
            />

            <Controller
              control={control}
              name="forecastTariffBackfillForce"
              render={({ field }) => (
                <ForecastToggle
                  id="settings-forecast-force"
                  label={t('settings.forecast.force')}
                  description={t('settings.forecast.forceDescription')}
                  checked={field.value}
                  disabled={!backfillOn}
                  onCheckedChange={field.onChange}
                />
              )}
            />
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
