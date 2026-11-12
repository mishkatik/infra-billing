import type { Provider } from '@infra/shared';
import { IconFilter } from '@tabler/icons-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaymentFilter } from '@/api/payments';
import { DateField } from '@/components/DateField';
import { Segmented } from '@/components/ink/Segmented';
import { ProviderCombobox } from '@/components/ProviderCombobox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toIso } from './paymentForm';

interface PaymentsFiltersProps {
  filter: PaymentFilter;
  setFilter: Dispatch<SetStateAction<PaymentFilter>>;
  providers: Provider[] | undefined;
}

type TypeOption = 'all' | NonNullable<PaymentFilter['type']>;

/** Header "Filter" button: provider, payment type and a custom date range, in a popover. */
export function PaymentsFilters({ filter, setFilter, providers }: PaymentsFiltersProps) {
  const { t } = useTranslation();
  const activeCount = [filter.providerUuid, filter.type, filter.from, filter.to].filter(
    Boolean,
  ).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <IconFilter className="size-3.5" />
          {t('common.filter')}
          {activeCount > 0 && <span className="text-ink-3">{activeCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="payments-filter-provider">{t('payments.filterProvider')}</Label>
          <ProviderCombobox
            id="payments-filter-provider"
            providers={providers}
            value={filter.providerUuid ?? ''}
            onChange={(v) => setFilter((f) => ({ ...f, providerUuid: v || undefined }))}
            resetLabel={t('payments.filterAllProviders')}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[13px] leading-none text-ink-2">{t('payments.filterType')}</p>
          <Segmented<TypeOption>
            ariaLabel={t('payments.filterType')}
            value={filter.type ?? 'all'}
            onChange={(v) => setFilter((f) => ({ ...f, type: v === 'all' ? undefined : v }))}
            options={[
              { value: 'all', label: t('payments.filterTypeAll') },
              { value: 'topup', label: t('payments.filterTypeTopup') },
              { value: 'charge', label: t('payments.filterTypeCharge') },
            ]}
          />
        </div>
        {/* Values are UTC-midnight ISO strings (toIso): slice the date part instead of parsing, which
            would shift the day in negative-offset timezones. */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="payments-filter-from">{t('payments.filterFrom')}</Label>
            <DateField
              id="payments-filter-from"
              placeholder={t('payments.datePlaceholder')}
              value={filter.from?.slice(0, 10) ?? ''}
              onChange={(v) => setFilter((f) => ({ ...f, from: v ? toIso(v) : undefined }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payments-filter-to">{t('payments.filterTo')}</Label>
            <DateField
              id="payments-filter-to"
              placeholder={t('payments.datePlaceholder')}
              value={filter.to?.slice(0, 10) ?? ''}
              onChange={(v) => setFilter((f) => ({ ...f, to: v ? toIso(v) : undefined }))}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
