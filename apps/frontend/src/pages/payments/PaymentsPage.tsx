import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type Dispatch, type SetStateAction, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/auth';
import { apiErrorMessage } from '@/api/client';
import {
  type PaymentFilter,
  useCreatePayment,
  useDeletePayment,
  usePayments,
} from '@/api/payments';
import { useProviders } from '@/api/providers';
import { useServices } from '@/api/services';
import { can } from '@/auth/permissions';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useEnums } from '@/constants';
import { useDisclosure } from '@/hooks/useDisclosure';
import { trimMoney } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';
import { PaymentFormModal } from './PaymentFormModal';
import { PaymentsFilters } from './PaymentsFilters';
import { PaymentsTable } from './PaymentsTable';
import { type PForm, toIso } from './paymentForm';

const PAGE_SIZE = 50;

export function PaymentsPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const me = useMe();
  const canEdit = can(me.data, 'payments:edit');
  const canReadProviders = can(me.data, 'providers:read');
  const canReadServices = can(me.data, 'services:read');
  const { data: providers } = useProviders({ enabled: canReadProviders });
  const [filter, setFilterState] = useState<PaymentFilter>({});
  const [rawPage, setRawPage] = useState(1);
  // A new filter always lands on page 1 — reset in the same event that changes the filter, so we
  // never fetch the old page against the new filter (the old effect chain did exactly that).
  const setFilter: Dispatch<SetStateAction<PaymentFilter>> = (update) => {
    setFilterState(update);
    setRawPage(1);
  };
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
  const providerOf = (uuid: string) => providers?.find((p) => p.uuid === uuid);

  const form = useForm<PForm>({
    defaultValues: {
      providerUuid: '',
      serviceUuid: '',
      amount: '',
      currency: 'RUB',
      paymentDate: dayjs().format('YYYY-MM-DD'),
      description: '',
    },
    mode: 'onSubmit',
  });

  const providerUuid = form.watch('providerUuid');
  const formServices = useServices(
    { providerUuid: providerUuid || undefined },
    { enabled: canReadServices },
  );
  const serviceOptions = (formServices.data ?? []).map((s) => ({ value: s.uuid, label: s.name }));

  const openCreate = () => {
    form.reset({
      providerUuid: providerOptions[0]?.value ?? '',
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
        providerUuid: v.providerUuid,
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
        subtitle={t('payments.subtitle')}
        actions={
          canEdit &&
          canReadProviders && (
            <Button onClick={openCreate} disabled={providerOptions.length === 0}>
              <IconPlus className="size-4" />
              {t('common.add')}
            </Button>
          )
        }
      />

      <PaymentsFilters filter={filter} setFilter={setFilter} providerOptions={providerOptions} />

      <PaymentsTable
        payments={payments}
        isLoading={isLoading}
        total={total}
        providerOf={providerOf}
        onDelete={canEdit ? doDelete : undefined}
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('payments.total', { count: total })}</p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="prev"
              disabled={page <= 1}
              onClick={() => setRawPage(Math.max(1, page - 1))}
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <span className="min-w-14 text-center text-sm tabular-nums">
              {page} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="next"
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
        providerOptions={providerOptions}
        serviceOptions={serviceOptions}
        currencyOptions={enums.currencyOptions}
        onSubmit={submit}
        onClose={close}
      />
    </div>
  );
}
