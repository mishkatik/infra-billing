import { DEFAULT_PROJECT_UUID, type Period, type Service, type ServiceType } from '@infra/shared';
import { IconPlus } from '@tabler/icons-react';
import dayjs, { type ManipulateType } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useCreatePayment } from '@/api/payments';
import { useProjects } from '@/api/projects';
import { useProviders } from '@/api/providers';
import { useRates } from '@/api/rates';
import {
  type ServiceFilter,
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateService,
} from '@/api/services';
import { useSettings } from '@/api/settings';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useEnums } from '@/constants';
import { useDisclosure } from '@/hooks/useDisclosure';
import { sortRows, useTableSort } from '@/hooks/useTableSort';
import { useCountryOptions } from '@/utils/countries';
import { trimMoney } from '@/utils/format';
import { buildRubMap } from '@/utils/money';
import { notifyError, notifySuccess } from '@/utils/notify';
import { BumpNextBillingDialog } from './BumpNextBillingDialog';
import { ServiceDetailModal } from './ServiceDetailModal';
import { ServiceFormModal } from './ServiceFormModal';
import { LOCATED_TYPES } from './ServiceTypeIcon';
import { clientMetaFromForm, metaString, toIso, type SForm } from './serviceForm';
import { ServicesFilters } from './ServicesFilters';
import { SERVICE_SORT_KEYS, serviceSortAccessors } from './servicesSort';
import { ServicesTable } from './ServicesTable';

// Quick-bump advances by one full billing period; hourly/onetime fall back to a month.
const PERIOD_STEP: Partial<Record<Period, [number, ManipulateType]>> = {
  monthly: [1, 'month'],
  quarterly: [3, 'month'],
  yearly: [1, 'year'],
  daily: [1, 'day'],
};

const bumpedDate = (s: Service): string | undefined => {
  if (!s.nextBillingAt) return undefined;
  const [n, unit] = PERIOD_STEP[s.period] ?? [1, 'month'];
  // Slice the UTC date part before the math: dayjs(iso) parses in local time,
  // which shifts midnight-UTC dates by a day in negative-offset timezones.
  return toIso(dayjs(s.nextBillingAt.slice(0, 10)).add(n, unit).format('YYYY-MM-DD'));
};

export function ServicesPage() {
  const { t, i18n } = useTranslation();
  const enums = useEnums();
  const countryOptions = useCountryOptions();
  const { data: providers } = useProviders();
  const { data: projects } = useProjects();
  const { data: rates } = useRates();
  const { data: settings } = useSettings();
  const [filter, setFilter] = useState<ServiceFilter>({});
  const { data: services, isLoading } = useServices(filter);
  const create = useCreateService();
  const update = useUpdateService();
  const del = useDeleteService();
  const [createOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  // Types created in a combobox this session, before (or besides) a saved service carries them.
  const [localTypes, setLocalTypes] = useState<string[]>([]);
  // Derived from the query so the detail modal always reflects the freshest list data.
  const selected = services?.find((s) => s.uuid === detailUuid) ?? null;

  const providerOptions = (providers ?? []).map((p) => ({ value: p.uuid, label: p.name }));
  const providerOf = (uuid: string) => providers?.find((p) => p.uuid === uuid);
  const projectOptions = (projects ?? []).map((p) => ({ value: p.uuid, label: p.name }));
  const projectOf = (uuid: string) => projects?.find((p) => p.uuid === uuid);
  // Default a new service to the default project (or the first one).
  const defaultProjectUuid =
    projects?.find((p) => p.uuid === DEFAULT_PROJECT_UUID)?.uuid ?? projectOptions[0]?.value ?? '';

  const { sort, toggleSort } = useTableSort('services-sort', SERVICE_SORT_KEYS);
  const sorted = sortRows(
    services,
    sort,
    serviceSortAccessors({
      rub: buildRubMap(rates),
      base: settings?.baseCurrency ?? 'RUB',
      providerOf,
      projectOf,
      serviceTypeLabel: enums.serviceTypeLabel,
    }),
    i18n.language,
  );

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
      vendor: '',
      marker: '',
      markerBg: '',
      nextBillingAt: '',
    },
    mode: 'onSubmit',
  });
  const formType = form.watch('type');

  const formTypeInUse = Boolean(createOpened || detailUuid);

  // Built-ins plus custom types still referenced by services / the open form / session creates.
  const typeOptions = useMemo(() => {
    const seen = new Set<string>(enums.serviceTypeOptions.map((o) => o.value));
    const extras: { value: string; label: string }[] = [];
    const add = (type: string) => {
      if (!type || seen.has(type)) return;
      seen.add(type);
      extras.push({ value: type, label: enums.serviceTypeLabel(type) });
    };
    for (const s of services ?? []) add(s.type);
    for (const type of localTypes) add(type);
    if (formTypeInUse) add(formType.trim());
    return extras.length === 0
      ? enums.serviceTypeOptions
      : [...enums.serviceTypeOptions, ...extras];
  }, [enums, services, localTypes, formType, formTypeInUse]);

  const rememberType = (type: string) => {
    const next = type.trim();
    if (!next) return;
    setLocalTypes((prev) => (prev.includes(next) ? prev : [...prev, next]));
  };

  // Drop session-only types once nothing uses them (last service deleted / form moved away).
  useEffect(() => {
    const used = new Set((services ?? []).map((s) => s.type));
    if (formTypeInUse) {
      const open = formType.trim();
      if (open) used.add(open);
    }
    setLocalTypes((prev) => {
      const next = prev.filter((t) => used.has(t));
      return next.length === prev.length ? prev : next;
    });
  }, [services, formType, formTypeInUse]);

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
      vendor: '',
      marker: '',
      markerBg: '',
      nextBillingAt: '',
    });
    openCreateModal();
  };

  const openDetail = (s: Service) => {
    const meta = (s.meta ?? {}) as Record<string, unknown>;
    const model = metaString(meta, 'model');
    const vendorFromModel = model.split('/')[0]?.replace(/^~/, '').trim().toLowerCase() ?? '';
    form.reset({
      providerUuid: s.providerUuid,
      projectUuid: s.projectUuid,
      name: s.name,
      type: s.type,
      cost: s.cost,
      currency: s.currency,
      period: s.period,
      countryCode: s.countryCode ?? '',
      vendor: metaString(meta, 'vendor') || vendorFromModel,
      marker: metaString(meta, 'marker'),
      markerBg: metaString(meta, 'markerBg'),
      nextBillingAt: s.nextBillingAt ? dayjs(s.nextBillingAt).format('YYYY-MM-DD') : '',
    });
    setDetailUuid(s.uuid);
  };

  const submit = form.handleSubmit(async (v) => {
    const meta = clientMetaFromForm(v);
    const located = LOCATED_TYPES.has(v.type);
    const countryCode = located ? v.countryCode || null : undefined;
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
            ...(located ? { countryCode } : {}),
            nextBillingAt: toIso(v.nextBillingAt) ?? null,
            meta,
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
          ...(located && countryCode ? { countryCode } : {}),
          nextBillingAt: toIso(v.nextBillingAt),
          isActive: true,
          meta,
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

  const [bumpTarget, setBumpTarget] = useState<Service | null>(null);
  const createPayment = useCreatePayment();
  const doBump = async (withPayment: boolean) => {
    const s = bumpTarget;
    if (!s?.nextBillingAt) return;
    try {
      // Payment first: if it fails nothing has changed, and if the date update then
      // fails, re-clicking with "bump only" completes the operation without a duplicate.
      if (withPayment) {
        await createPayment.mutateAsync({
          providerUuid: s.providerUuid,
          serviceUuid: s.uuid,
          amount: s.cost,
          currency: s.currency,
          // Stored in the DB, so it is fixed in the UI language active at creation time.
          description: t('services.bumpDescription'),
          paymentDate: toIso(dayjs().format('YYYY-MM-DD'))!,
          // `topup`, not `charge`: analytics treats charges as per-service detail of a top-up and
          // skips them for providers that have top-ups — a manual renewal would vanish from spend.
          type: 'topup',
        });
      }
      await update.mutateAsync({ uuid: s.uuid, dto: { nextBillingAt: bumpedDate(s) } });
      notifySuccess(t(withPayment ? 'services.bumpChargedToast' : 'services.updatedToast'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    } finally {
      setBumpTarget(null);
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
        typeOptions={typeOptions}
      />

      <ServicesTable
        services={sorted}
        isLoading={isLoading}
        providerOf={providerOf}
        projectOf={projectOf}
        serviceTypeLabel={enums.serviceTypeLabel}
        periodLabel={enums.periodLabel}
        sort={sort}
        onToggleSort={toggleSort}
        onRowClick={openDetail}
        onBumpNextBilling={setBumpTarget}
      />

      <ServiceFormModal
        opened={createOpened}
        form={form}
        isPending={create.isPending}
        providerOptions={providerOptions}
        projectOptions={projectOptions}
        typeOptions={typeOptions}
        periodOptions={enums.periodOptions}
        currencyOptions={enums.currencyOptions}
        countryOptions={countryOptions}
        onTypeCreated={rememberType}
        onSubmit={submit}
        onClose={closeCreateModal}
      />

      <ServiceDetailModal
        service={selected}
        form={form}
        providerOptions={providerOptions}
        projectOptions={projectOptions}
        typeOptions={typeOptions}
        periodOptions={enums.periodOptions}
        currencyOptions={enums.currencyOptions}
        countryOptions={countryOptions}
        isSaving={update.isPending && !togglingActive}
        isToggling={togglingActive}
        onTypeCreated={rememberType}
        onSubmit={submit}
        onToggleActive={toggleActive}
        onDelete={doDelete}
        onClose={() => setDetailUuid(null)}
      />

      <BumpNextBillingDialog
        service={bumpTarget}
        nextDate={bumpTarget ? bumpedDate(bumpTarget) : undefined}
        isPending={createPayment.isPending || update.isPending}
        onConfirm={doBump}
        onClose={() => setBumpTarget(null)}
      />
    </div>
  );
}
