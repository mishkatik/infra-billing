import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaymentFilter } from '@/api/payments';
import { DateField } from '@/components/DateField';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toIso } from './paymentForm';

// Radix Select forbids value="" — sentinel for the "all providers" item.
const ALL = 'all';

interface PaymentsFiltersProps {
  filter: PaymentFilter;
  setFilter: Dispatch<SetStateAction<PaymentFilter>>;
  providerOptions: { value: string; label: string }[];
}

export function PaymentsFilters({ filter, setFilter, providerOptions }: PaymentsFiltersProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-[220px] space-y-1.5">
        <Label htmlFor="payments-filter-provider">{t('payments.filterProvider')}</Label>
        <Select
          value={filter.providerUuid ?? ALL}
          onValueChange={(v) =>
            setFilter((f) => ({ ...f, providerUuid: v === ALL ? undefined : v }))
          }
        >
          <SelectTrigger id="payments-filter-provider" className="w-full">
            <SelectValue placeholder={t('payments.filterAllProviders')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('payments.filterAllProviders')}</SelectItem>
            {providerOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Values are UTC-midnight ISO strings (toIso): slice the date part instead of parsing, which
          would shift the day in negative-offset timezones. */}
      <div className="w-[160px] space-y-1.5">
        <Label htmlFor="payments-filter-from">{t('payments.filterFrom')}</Label>
        <DateField
          id="payments-filter-from"
          placeholder={t('payments.datePlaceholder')}
          value={filter.from?.slice(0, 10) ?? ''}
          onChange={(v) => setFilter((f) => ({ ...f, from: v ? toIso(v) : undefined }))}
        />
      </div>
      <div className="w-[160px] space-y-1.5">
        <Label htmlFor="payments-filter-to">{t('payments.filterTo')}</Label>
        <DateField
          id="payments-filter-to"
          placeholder={t('payments.datePlaceholder')}
          value={filter.to?.slice(0, 10) ?? ''}
          onChange={(v) => setFilter((f) => ({ ...f, to: v ? toIso(v) : undefined }))}
        />
      </div>
    </div>
  );
}
