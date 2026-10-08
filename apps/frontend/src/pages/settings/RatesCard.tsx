import { IconHistory, IconLoader2, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useAddRate, useBackfillRates, useRates, useRefreshRates } from '@/api/rates';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';

interface RateForm {
  code: string;
  rate: string;
}

export function RatesCard() {
  const { t } = useTranslation();
  const { data: rates } = useRates();
  const addRate = useAddRate();
  const refresh = useRefreshRates();
  const backfill = useBackfillRates();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RateForm>({ defaultValues: { code: '', rate: '' }, mode: 'onSubmit' });

  const submitRate = handleSubmit(async (v) => {
    try {
      await addRate.mutateAsync({ code: v.code.toUpperCase(), rate: v.rate });
      reset();
      notifySuccess(t('settings.rates.added'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doRefresh = async () => {
    try {
      const res = await refresh.mutateAsync();
      notifySuccess(t('settings.rates.updated', { count: res.updated }));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doBackfill = async () => {
    try {
      const res = await backfill.mutateAsync();
      if (res.failed.length > 0) {
        notifyError(t('settings.rates.backfillPartial', { codes: res.failed.join(', ') }));
        return;
      }
      notifySuccess(t('settings.rates.backfilled', { count: res.inserted }));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow
        title={t('settings.rates.title')}
        count={rates?.length ?? 0}
        className="flex-wrap"
      >
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={backfill.isPending}
            onClick={doBackfill}
          >
            {backfill.isPending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconHistory className="size-4" />
            )}
            {t('settings.rates.backfillHistory')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={refresh.isPending}
            onClick={doRefresh}
          >
            {refresh.isPending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconRefresh className="size-4" />
            )}
            {t('settings.rates.refreshFromCbr')}
          </Button>
        </div>
      </CardHeadRow>

      <form onSubmit={submitRate} className="border-b border-hairline px-6 py-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="w-[120px] space-y-1.5">
            <Label htmlFor="rate-code">{t('settings.rates.code')}</Label>
            <Input
              id="rate-code"
              placeholder={t('settings.rates.codePlaceholder')}
              aria-invalid={!!errors.code}
              {...register('code', {
                validate: (v) => /^[A-Za-z]{3,4}$/.test(v) || t('validation.currencyCode'),
              })}
            />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>
          <div className="w-[160px] space-y-1.5">
            <Label htmlFor="rate-value">{t('settings.rates.rate')}</Label>
            <Input
              id="rate-value"
              inputMode="decimal"
              placeholder={t('settings.rates.ratePlaceholder')}
              aria-invalid={!!errors.rate}
              {...register('rate', {
                validate: (v) => /^\d+(\.\d{1,8})?$/.test(v) || t('validation.ratePositive'),
              })}
            />
            {errors.rate && <p className="text-xs text-destructive">{errors.rate.message}</p>}
          </div>
          {/* Spacer the height of a label keeps the button on the input row when an error shows. */}
          <div className="space-y-1.5">
            <span aria-hidden className="block h-3.5" />
            <Button type="submit" variant="secondary" disabled={addRate.isPending}>
              {addRate.isPending ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconPlus className="size-4" />
              )}
              {t('settings.rates.addManual')}
            </Button>
          </div>
        </div>
      </form>

      <Table className="min-w-[420px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">{t('settings.rates.thCurrency')}</TableHead>
            <TableHead>{t('settings.rates.thRate')}</TableHead>
            <TableHead>{t('settings.rates.thSource')}</TableHead>
            <TableHead className="pr-6">{t('settings.rates.thUpdated')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates?.map((r) => (
            <TableRow key={r.code}>
              <TableCell className="pl-6 font-medium">{r.code}</TableCell>
              <TableCell>{r.rate}</TableCell>
              <TableCell>
                {r.source === 'manual' ? (
                  <Badge variant="secondary">{t('settings.rates.sourceManual')}</Badge>
                ) : (
                  <Badge variant="outline">{t(`settings.rates.source_${r.source}`)}</Badge>
                )}
              </TableCell>
              <TableCell className="pr-6 text-ink-2">{formatDate(r.capturedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
