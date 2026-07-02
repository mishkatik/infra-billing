import { DEFAULT_PROJECT_UUID, type Period, type Service, type ServiceType } from '@infra/shared';
import { IconPlus } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useProjects } from '@/api/projects';
import { useProviders } from '@/api/providers';
import {
  type ServiceFilter,
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateService,
} from '@/api/services';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useEnums } from '@/constants';
import { useDisclosure } from '@/hooks/useDisclosure';
import { useCountryOptions } from '@/utils/countries';
import { trimMoney } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';
import { type SForm, toIso } from './serviceForm';
import { ServiceDetailModal } from './ServiceDetailModal';
import { ServiceFormModal } from './ServiceFormModal';
import { ServicesFilters } from './ServicesFilters';
import { ServicesTable } from './ServicesTable';

export function ServicesPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const countryOptions = useCountryOptions();
  const { data: providers } = useProviders();
  const { data: projects } = useProjects();
  const [filter, setFilter] = useState<ServiceFilter>({});
  const { data: services, isLoading } = useServices(filter);
  const create = useCreateService();
  const update = useUpdateService();
  const del = useDeleteService();
  const [createOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  // Derived from the query so the detail modal always reflects the freshest list data.
  const selected = services?.find((s) => s.uuid === detailUuid) ?? null;

  const providerOptions = (providers ?? []).map((p) => ({ value: p.uuid, label: p.name }));
  const providerOf = (uuid: string) => providers?.find((p) => p.uuid === uuid);
  const projectOptions = (projects ?? []).map((p) => ({ value: p.uuid, label: p.name }));
  const projectOf = (uuid: string) => projects?.find((p) => p.uuid === uuid);
  // Default a new service to the default project (or the first one).
  const defaultProjectUuid =
    projects?.find((p) => p.uuid === DEFAULT_PROJECT_UUID)?.uuid ?? projectOptions[0]?.value ?? '';

  const form = useForm<SForm>({
    defaultValues: {
      providerUuid: '',
      projectUuid: '',
      name: '',
      type: 'vps',
      cost: '',
      currency: 'RUB',
      period: 'monthly',
      countryCode: '',
      nextBillingAt: '',
    },
    mode: 'onSubmit',
  });

  const openCreate = () => {
    form.reset({
      providerUuid: providerOptions[0]?.value ?? '',
      projectUuid: defaultProjectUuid,
      name: '',
      type: 'vps',
      cost: '',
      currency: 'RUB',
      period: 'monthly',
      countryCode: '',
      nextBillingAt: '',
    });
    openCreateModal();
  };

  const openDetail = (s: Service) => {
    form.reset({
      providerUuid: s.providerUuid,
      projectUuid: s.projectUuid,
      name: s.name,
      type: s.type,
      cost: s.cost,
      currency: s.currency,
      period: s.period,
      countryCode: s.countryCode ?? '',
      nextBillingAt: s.nextBillingAt ? dayjs(s.nextBillingAt).format('YYYY-MM-DD') : '',
    });
    setDetailUuid(s.uuid);
  };

  const submit = form.handleSubmit(async (v) => {
    try {
      if (selected) {
        await update.mutateAsync({
          uuid: selected.uuid,
          dto: {
            providerUuid: v.providerUuid,
            projectUuid: v.projectUuid,
            name: v.name,
            type: v.type as ServiceType,
            cost: trimMoney(v.cost),
            currency: v.currency,
            period: v.period as Period,
            countryCode: v.countryCode || null,
            nextBillingAt: toIso(v.nextBillingAt) ?? null,
          },
        });
        setDetailUuid(null);
        notifySuccess(t('services.updatedToast'));
      } else {
        await create.mutateAsync({
          providerUuid: v.providerUuid,
          projectUuid: v.projectUuid,
          name: v.name,
          type: v.type as ServiceType,
          cost: trimMoney(v.cost),
          currency: v.currency,
          period: v.period as Period,
          countryCode: v.countryCode || undefined,
          nextBillingAt: toIso(v.nextBillingAt),
          isActive: true,
        });
        closeCreateModal();
        notifySuccess(t('services.createdToast'));
      }
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doDelete = async (s: Service) => {
    if (!window.confirm(t('services.confirmDelete', { name: s.name }))) return;
    try {
      await del.mutateAsync(s.uuid);
      setDetailUuid(null);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  // Instant enable/disable from the detail modal footer; the form deliberately does not
  // carry isActive, so a later Save can't revert this switch.
  const [togglingActive, setTogglingActive] = useState(false);
  const toggleActive = async (s: Service) => {
    setTogglingActive(true);
    try {
      await update.mutateAsync({ uuid: s.uuid, dto: { isActive: !s.isActive } });
      notifySuccess(t(s.isActive ? 'services.disabledToast' : 'services.enabledToast'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    } finally {
      setTogglingActive(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('services.title')}
        subtitle={t('services.subtitle')}
        actions={
          <Button onClick={openCreate} disabled={providerOptions.length === 0}>
            <IconPlus className="size-4" />
            {t('common.add')}
          </Button>
        }
      />

      <ServicesFilters
        filter={filter}
        setFilter={setFilter}
        providerOptions={providerOptions}
        projectOptions={projectOptions}
        typeOptions={enums.serviceTypeOptions}
      />

      <ServicesTable
        services={services}
        isLoading={isLoading}
        providerOf={providerOf}
        projectOf={projectOf}
        serviceTypeLabel={enums.serviceTypeLabel}
        periodLabel={enums.periodLabel}
        onRowClick={openDetail}
      />

      <ServiceFormModal
        opened={createOpened}
        form={form}
        isPending={create.isPending}
        providerOptions={providerOptions}
        projectOptions={projectOptions}
        typeOptions={enums.serviceTypeOptions}
        periodOptions={enums.periodOptions}
        currencyOptions={enums.currencyOptions}
        countryOptions={countryOptions}
        onSubmit={submit}
        onClose={closeCreateModal}
      />

      <ServiceDetailModal
        service={selected}
        form={form}
        providerOptions={providerOptions}
        projectOptions={projectOptions}
        typeOptions={enums.serviceTypeOptions}
        periodOptions={enums.periodOptions}
        currencyOptions={enums.currencyOptions}
        countryOptions={countryOptions}
        isSaving={update.isPending && !togglingActive}
        isToggling={togglingActive}
        onSubmit={submit}
        onToggleActive={toggleActive}
        onDelete={doDelete}
        onClose={() => setDetailUuid(null)}
      />
    </div>
  );
}
