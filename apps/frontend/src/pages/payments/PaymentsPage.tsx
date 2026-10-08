import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import {
  parsePaymentFilter,
  type PaymentFilter,
  useCreatePayment,
  useDeletePayment,
  usePayments,
} from '@/api/payments';
import { useProviders } from '@/api/providers';
import { useServices } from '@/api/services';
import { Segmented } from '@/components/ink/Segmented';
import { PageHeader } from '@/components/PageHeader';
import { ResetViewButton } from '@/components/ResetViewButton';
import { Button } from '@/components/ui/button';
import { useEnums } from '@/constants';
import { useDisclosure } from '@/hooks/useDisclosure';
import { isStaleUuid, usePersistedState } from '@/hooks/usePersistedState';
import { trimMoney } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';
import { buildAccountIndex } from '@/utils/providerState';
import { accountsOf, impliedAccount } from '../services/AccountSelect';
import { PaymentFormModal } from './PaymentFormModal';
import { PaymentsFilters } from './PaymentsFilters';
import { PaymentsTable } from './PaymentsTable';
import { type PForm, toIso } from './paymentForm';

const PAGE_SIZE = 50;

// Date presets for the header segmented control. A preset is relative ("the last 30 days"): its
// id is saved under its own key and "from" is re-anchored to today on every visit, while the
// persisted from/to keep driving the query.
const PRESETS = [
  { value: '30d', amount: 30, unit: 'day' },
  { value: '90d', amount: 90, unit: 'day' },
  { value: '1y', amount: 1, unit: 'year' },
] as const;

type PresetId = (typeof PRESETS)[number]['value'];
type PresetValue = PresetId | 'all';
interface SavedRange {
  range?: PresetId;
}

const parseRange = (raw: unknown): SavedRange | null => {
  const range = (raw as SavedRange | null)?.range;
  return PRESETS.some((p) => p.value === range) ? { range } : null;
};

const presetFrom = (preset: (typeof PRESETS)[number]) =>
  toIso(dayjs().subtract(preset.amount, preset.unit).format('YYYY-MM-DD'));

export function PaymentsPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: providers } = useProviders();
  const [filter, setFilterState] = usePersistedState<PaymentFilter>(
    'payments-filter',
    parsePaymentFilter,
    {},
  );
  const [rawPage, setRawPage] = useState(1);
  // A new filter always lands on page 1 — reset in the same event that changes the filter, so we
  // never fetch the old page against the new filter (the old effect chain did exactly that).
  const setFilter: Dispatch<SetStateAction<PaymentFilter>> = (update) => {
    setFilterState(update);
    setRawPage(1);
  };
  // A saved filter may name a provider deleted since; adjust during render (like the page clamp
  // below) so a blank Select over an empty journal is never committed. Loading lists keep the value.
  if (isStaleUuid(filter.providerUuid, providers))
    setFilter((f) => ({ ...f, providerUuid: undefined }));
  const [savedRange, setSavedRange] = usePersistedState<SavedRange>(
    'payments-range',
    parseRange,
    {},
  );
  const rangePreset = PRESETS.find((p) => p.value === savedRange.range);
  // A preset saved on an earlier day still means "the last N days": re-anchor its start.
  if (rangePreset && (filter.to || filter.from !== presetFrom(rangePreset)))
    setFilterState((f) => ({ ...f, from: presetFrom(rangePreset), to: undefined }));
  const activePreset: PresetValue | null = rangePreset
    ? rangePreset.value
    : !filter.from && !filter.to
      ? 'all'
      : null;
  const { data, isLoading } = usePayments(filter, { page: rawPage, pageSize: PAGE_SIZE });
  const payments = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Pagination is server-side, so a shrunken total (e.g. after deletions) must move the query to
  // the last real page — adjust state during render (React restarts before commit) instead of an
  // effect, and clamp the displayed page for the adjusting pass.
  if (data && rawPage > pageCount) setRawPage(pageCount);
  const page = Math.min(rawPage, pageCount);
  const create = useCreatePayment();
  const del = useDeletePayment();
  const [opened, { open, close }] = useDisclosure(false);

  const providerOptions = (providers ?? []).map((p) => ({ value: p.uuid, label: p.name }));
  const accountIndex = useMemo(() => buildAccountIndex(providers), [providers]);
  const accountOf = (uuid: string) => accountIndex.get(uuid);
  const { data: services } = useServices();
  const serviceOf = (uuid: string) => services?.find((s) => s.uuid === uuid);

  const form = useForm<PForm>({
    defaultValues: {
      providerUuid: '',
      accountUuid: '',
      serviceUuid: '',
      amount: '',
      currency: 'RUB',
      paymentDate: dayjs().format('YYYY-MM-DD'),
      description: '',
    },
    mode: 'onSubmit',
  });

  const providerUuid = form.watch('providerUuid');
  const accountUuid = form.watch('accountUuid');
  const formServices = useServices({ providerUuid: providerUuid || undefined });
  // Narrowed to the chosen account on the client: the provider list is already loaded.
  const serviceOptions = (formServices.data ?? [])
    .filter((s) => !accountUuid || s.accountUuid === accountUuid)
    .map((s) => ({ value: s.uuid, label: s.name }));

  const openCreate = () => {
    form.reset({
      providerUuid: providerOptions[0]?.value ?? '',
      accountUuid: impliedAccount(accountsOf(providers, providerOptions[0]?.value ?? '')),
      serviceUuid: '',
      amount: '',
      currency: 'RUB',
      paymentDate: dayjs().format('YYYY-MM-DD'),
      description: '',
    });
    open();
  };

  const submit = form.handleSubmit(async (v) => {
    try {
      await create.mutateAsync({
        accountUuid: v.accountUuid,
        serviceUuid: v.serviceUuid || undefined,
        amount: trimMoney(v.amount),
        currency: v.currency,
        paymentDate: toIso(v.paymentDate)!,
        description: v.description || undefined,
      });
      close();
      notifySuccess(t('payments.created'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const applyPreset = (value: PresetValue) => {
    const preset = PRESETS.find((p) => p.value === value);
    setSavedRange(preset ? { range: preset.value } : {});
    setFilter((f) => ({ ...f, from: preset ? presetFrom(preset) : undefined, to: undefined }));
  };
  // Dates picked by hand in the Filter popover replace the preset with a custom range.
  const setFilterFromPopover: Dispatch<SetStateAction<PaymentFilter>> = (update) => {
    const next = typeof update === 'function' ? update(filter) : update;
    if (next.from !== filter.from || next.to !== filter.to) setSavedRange({});
    setFilter(next);
  };
  const resetView = () => {
    setSavedRange({});
    setFilter({});
  };
  const filterActive = Object.values(filter).some((v) => v !== undefined);

  const doDelete = async (uuid: string) => {
    if (!window.confirm(t('payments.confirmDelete'))) return;
    try {
      await del.mutateAsync(uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('payments.title')}
        controls={
          <Segmented<PresetValue | 'custom'>
            ariaLabel={t('payments.periodLabel')}
            value={activePreset ?? 'custom'}
            onChange={(v) => v !== 'custom' && applyPreset(v)}
            options={[
              ...PRESETS.map((p) => ({
                value: p.value,
                label: t(`payments.preset.${p.value}`),
              })),
              { value: 'all' as const, label: t('common.all') },
            ]}
          />
        }
        actions={
          <>
            {filterActive && <ResetViewButton onClick={resetView} />}
            <PaymentsFilters
              filter={filter}
              setFilter={setFilterFromPopover}
              providerOptions={providerOptions}
            />
            <Button size="sm" onClick={openCreate} disabled={providerOptions.length === 0}>
              <IconPlus className="size-4" />
              {t('common.add')}
            </Button>
          </>
        }
      />

      <PaymentsTable
        payments={payments}
        isLoading={isLoading}
        total={total}
        accountOf={accountOf}
        serviceOf={serviceOf}
        onDelete={doDelete}
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-2">{t('payments.total', { count: total })}</p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('payments.prevPage')}
              disabled={page <= 1}
              onClick={() => setRawPage(Math.max(1, page - 1))}
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <span className="min-w-14 text-center text-[13px] text-ink-2">
              {page} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('payments.nextPage')}
              disabled={page >= pageCount}
              onClick={() => setRawPage(Math.min(pageCount, page + 1))}
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <PaymentFormModal
        opened={opened}
        form={form}
        isPending={create.isPending}
        providers={providers}
        serviceOptions={serviceOptions}
        currencyOptions={enums.currencyOptions}
        onSubmit={submit}
        onClose={close}
      />
    </div>
  );
}
