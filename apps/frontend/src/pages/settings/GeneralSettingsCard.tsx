import type { RateSource } from '@infra/shared';
import { IconLoader2 } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useSettings, useUpdateSettings } from '@/api/settings';
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
import { CURRENCY_OPTIONS, useEnums } from '@/constants';
import { notifyError, notifySuccess } from '@/utils/notify';

interface SettingsForm {
  baseCurrency: string;
  syncIntervalHours: number;
  rateSource: string;
}

export function GeneralSettingsCard() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const rateSourceOptions = [
    { value: 'cbr', label: enums.rateSourceLabel('cbr') },
    { value: 'manual', label: enums.rateSourceLabel('manual') },
  ];

  const { control, register, handleSubmit, reset } = useForm<SettingsForm>({
    defaultValues: { baseCurrency: 'RUB', syncIntervalHours: 6, rateSource: 'cbr' },
    mode: 'onSubmit',
  });

  // Re-seed the form when settings load
  useEffect(() => {
    if (!settings) return;
    reset({
      baseCurrency: settings.baseCurrency,
      syncIntervalHours: settings.syncIntervalHours,
      rateSource: settings.rateSource,
    });
  }, [settings, reset]);

  const saveSettings = handleSubmit(async (v) => {
    try {
      await updateSettings.mutateAsync({
        baseCurrency: v.baseCurrency,
        syncIntervalHours: v.syncIntervalHours,
        rateSource: v.rateSource as RateSource,
      });
      notifySuccess(t('settings.settingsSaved'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

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
