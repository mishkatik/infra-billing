import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { notifyError, notifySuccess } from '@/utils/notify';
import { IconEdit, IconMapPin, IconPlus, IconReceipt2, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import type { Period, Service, ServiceType } from '@infra/shared';
import {
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateService,
  type ServiceFilter,
} from '@/api/services';
import { useProviders } from '@/api/providers';
import { usePayments } from '@/api/payments';
import { apiErrorMessage } from '@/api/client';
import { useEnums } from '@/constants';
import { countryFlag, formatDateShort, formatMoney, trimMoney } from '@/utils/format';
import { providerFavicon } from '@/utils/favicon';
import { useCountryOptions } from '@/utils/countries';
import { ProviderIcon } from '@/components/ProviderIcon';

interface SForm {
  providerUuid: string;
  name: string;
  type: string;
  cost: string;
  currency: string;
  period: string;
  countryCode: string;
  nextBillingAt: string;
  isActive: boolean;
}

const toIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);

export function ServicesPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const countryOptions = useCountryOptions();
  const { data: providers } = useProviders();
  const [filter, setFilter] = useState<ServiceFilter>({});
  const { data: services, isLoading } = useServices(filter);
  const create = useCreateService();
  const update = useUpdateService();
  const del = useDeleteService();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [paymentsFor, setPaymentsFor] = useState<Service | null>(null);
  const servicePayments = usePayments(
    { serviceUuid: paymentsFor?.uuid },
    { enabled: Boolean(paymentsFor), pageSize: 100 },
  );
  const servicePaymentItems = servicePayments.data?.items ?? [];

  const providerOptions = (providers ?? []).map((p) => ({ value: p.uuid, label: p.name }));
  const providerOf = (uuid: string) => providers?.find((p) => p.uuid === uuid);

  const form = useForm<SForm>({
    initialValues: {
      providerUuid: '',
      name: '',
      type: 'vps',
      cost: '',
      currency: 'RUB',
      period: 'monthly',
      countryCode: '',
      nextBillingAt: '',
      isActive: true,
    },
    validate: {
      name: (v) => (v.trim() ? null : t('validation.enterName')),
      // Accept any number of decimals — extra ones are trimmed to 2 (on blur + submit).
      cost: (v) => (/^\d+(\.\d+)?$/.test(v) ? null : t('validation.amountFormat')),
      providerUuid: (v) => (v ? null : t('validation.selectProvider')),
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.setValues({
      providerUuid: providerOptions[0]?.value ?? '',
      name: '',
      type: 'vps',
      cost: '',
      currency: 'RUB',
      period: 'monthly',
      countryCode: '',
      nextBillingAt: '',
      isActive: true,
    });
    open();
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    form.setValues({
      providerUuid: s.providerUuid,
      name: s.name,
      type: s.type,
      cost: s.cost,
      currency: s.currency,
      period: s.period,
      countryCode: s.countryCode ?? '',
      nextBillingAt: s.nextBillingAt ? dayjs(s.nextBillingAt).format('YYYY-MM-DD') : '',
      isActive: s.isActive,
    });
    open();
  };

  const submit = form.onSubmit(async (v) => {
    try {
      if (editing) {
        await update.mutateAsync({
          uuid: editing.uuid,
          dto: {
            name: v.name,
            type: v.type as ServiceType,
            cost: trimMoney(v.cost),
            currency: v.currency,
            period: v.period as Period,
            countryCode: v.countryCode || null,
            nextBillingAt: toIso(v.nextBillingAt) ?? null,
            isActive: v.isActive,
          },
        });
      } else {
        await create.mutateAsync({
          providerUuid: v.providerUuid,
          name: v.name,
          type: v.type as ServiceType,
          cost: trimMoney(v.cost),
          currency: v.currency,
          period: v.period as Period,
          countryCode: v.countryCode || undefined,
          nextBillingAt: toIso(v.nextBillingAt),
          isActive: v.isActive,
        });
      }
      close();
      notifySuccess(editing ? t('services.updatedToast') : t('services.createdToast'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doDelete = async (s: Service) => {
    if (!window.confirm(t('services.confirmDelete', { name: s.name }))) return;
    try {
      await del.mutateAsync(s.uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t('services.title')}</Title>
          <Text c="dimmed">{t('services.subtitle')}</Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={openCreate}
          disabled={providerOptions.length === 0}
        >
          {t('common.add')}
        </Button>
      </Group>

      <Group>
        <Select
          placeholder={t('services.filterAllProviders')}
          clearable
          data={providerOptions}
          value={filter.providerUuid ?? null}
          onChange={(v) => setFilter((f) => ({ ...f, providerUuid: v ?? undefined }))}
          w={220}
        />
        <Select
          placeholder={t('services.filterAllTypes')}
          clearable
          data={enums.serviceTypeOptions}
          value={filter.type ?? null}
          onChange={(v) => setFilter((f) => ({ ...f, type: v ?? undefined }))}
          w={200}
        />
        <Select
          placeholder={t('services.filterActivity')}
          clearable
          data={[
            { value: 'true', label: t('services.activityActive') },
            { value: 'false', label: t('services.activityInactive') },
          ]}
          value={filter.isActive === undefined ? null : String(filter.isActive)}
          onChange={(v) =>
            setFilter((f) => ({ ...f, isActive: v == null ? undefined : v === 'true' }))
          }
          w={160}
        />
      </Group>

      <Table.ScrollContainer minWidth={820}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('services.colName')}</Table.Th>
              <Table.Th>{t('services.colProvider')}</Table.Th>
              <Table.Th>{t('services.colType')}</Table.Th>
              <Table.Th>{t('services.colCost')}</Table.Th>
              <Table.Th>{t('services.colPeriod')}</Table.Th>
              <Table.Th>{t('services.colNextBilling')}</Table.Th>
              <Table.Th>{t('services.colSource')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {services?.map((s) => (
              <Table.Tr key={s.uuid} style={{ opacity: s.isActive ? 1 : 0.5 }}>
                <Table.Td>
                  <Group gap={6}>
                    <span>{countryFlag(s.countryCode)}</span>
                    <Text fw={600}>{s.name}</Text>
                    {!s.isActive && (
                      <Badge size="xs" color="gray">
                        {t('services.badgeInactive')}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <ProviderIcon
                      name={providerOf(s.providerUuid)?.name ?? ''}
                      src={providerFavicon(
                        providerOf(s.providerUuid) ?? { faviconLink: null, loginUrl: null },
                      )}
                      size={18}
                    />
                    <Text size="sm">{providerOf(s.providerUuid)?.name ?? ''}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>{enums.serviceTypeLabel(s.type)}</Table.Td>
                <Table.Td>{formatMoney(s.cost, s.currency)}</Table.Td>
                <Table.Td>{enums.periodLabel(s.period)}</Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {formatDateShort(s.nextBillingAt)}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={s.isManaged ? 'brand' : 'gray'}>
                    {s.isManaged ? t('services.sourceManaged') : t('services.sourceManual')}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    {(s.paymentsCount ?? 0) > 0 && (
                      <Tooltip
                        label={t('services.paymentsTooltip', { count: s.paymentsCount ?? 0 })}
                      >
                        <ActionIcon variant="subtle" onClick={() => setPaymentsFor(s)}>
                          <IconReceipt2 size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <ActionIcon variant="subtle" onClick={() => openEdit(s)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => doDelete(s)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && services?.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text c="dimmed" ta="center" py="md">
                    {t('services.empty')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? t('services.modalEdit') : t('services.modalCreate')}
      >
        <form onSubmit={submit}>
          <Stack>
            {!editing && (
              <Select
                label={t('services.fieldProvider')}
                data={providerOptions}
                allowDeselect={false}
                {...form.getInputProps('providerUuid')}
              />
            )}
            <TextInput label={t('services.fieldName')} required {...form.getInputProps('name')} />
            <Group grow>
              <Select
                label={t('services.fieldType')}
                data={enums.serviceTypeOptions}
                allowDeselect={false}
                {...form.getInputProps('type')}
              />
              <Select
                label={t('services.fieldPeriod')}
                data={enums.periodOptions}
                allowDeselect={false}
                {...form.getInputProps('period')}
              />
            </Group>
            <Group grow>
              <TextInput
                label={t('services.fieldCost')}
                required
                {...form.getInputProps('cost')}
                onBlur={(e) => form.setFieldValue('cost', trimMoney(e.currentTarget.value))}
              />
              <Select
                label={t('services.fieldCurrency')}
                data={enums.currencyOptions}
                allowDeselect={false}
                {...form.getInputProps('currency')}
              />
            </Group>
            <Group grow>
              <Select
                label={t('services.fieldCountry')}
                placeholder={t('services.countryPlaceholder')}
                searchable
                clearable
                data={countryOptions}
                leftSection={<IconMapPin size={16} />}
                {...form.getInputProps('countryCode')}
              />
              <DateInput
                label={t('services.fieldNextBilling')}
                clearable
                valueFormat="DD.MM.YYYY"
                placeholder={t('services.nextBillingPlaceholder')}
                value={form.values.nextBillingAt || null}
                onChange={(v) => form.setFieldValue('nextBillingAt', v ?? '')}
              />
            </Group>
            <Switch
              label={t('services.fieldActive')}
              {...form.getInputProps('isActive', { type: 'checkbox' })}
            />
            <Button type="submit" loading={create.isPending || update.isPending}>
              {t('common.save')}
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={!!paymentsFor}
        onClose={() => setPaymentsFor(null)}
        title={t('services.paymentsTitle', { name: paymentsFor?.name ?? '' })}
        size="xl"
      >
        {servicePayments.isLoading ? (
          <Text c="dimmed" py="md" ta="center">
            {t('common.loading')}
          </Text>
        ) : servicePaymentItems.length === 0 ? (
          <Text c="dimmed" py="md" ta="center">
            {t('services.paymentsEmpty')}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>
                    {t('services.paymentsColDate')}
                  </Table.Th>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>
                    {t('services.paymentsColType')}
                  </Table.Th>
                  <Table.Th style={{ whiteSpace: 'nowrap' }}>
                    {t('services.paymentsColAmount')}
                  </Table.Th>
                  <Table.Th>{t('services.paymentsColDescription')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {servicePaymentItems.map((p) => (
                  <Table.Tr key={p.uuid}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {formatDateShort(p.paymentDate)}
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      <Badge
                        variant="light"
                        color={p.type === 'charge' ? 'gray' : 'teal'}
                        styles={{
                          root: { maxWidth: 'none', overflow: 'visible' },
                          label: { overflow: 'visible' },
                        }}
                      >
                        {p.type === 'charge'
                          ? t('services.paymentCharge')
                          : t('services.paymentTopup')}
                      </Badge>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      <Text fw={600}>{formatMoney(p.amount, p.currency)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
                        {p.description ?? t('common.none')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Modal>
    </Stack>
  );
}
