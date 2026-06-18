import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { notifyError, notifySuccess } from '@/utils/notify';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
  useCreatePayment,
  useDeletePayment,
  usePayments,
  type PaymentFilter,
} from '@/api/payments';
import { useServices } from '@/api/services';
import { useProviders } from '@/api/providers';
import { apiErrorMessage } from '@/api/client';
import { useEnums } from '@/constants';
import { formatDateShort, formatMoney } from '@/utils/format';

interface PForm {
  providerUuid: string;
  serviceUuid: string;
  amount: string;
  currency: string;
  paymentDate: string;
  description: string;
}

const toIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);
const PAGE_SIZE = 50;

export function PaymentsPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: providers } = useProviders();
  const [filter, setFilter] = useState<PaymentFilter>({});
  const [page, setPage] = useState(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset page only when the filter changes
  useEffect(() => setPage(1), [filter]);
  const { data, isLoading } = usePayments(filter, { page, pageSize: PAGE_SIZE });
  const payments = data?.items ?? [];
  const total = data?.total ?? 0;
  const create = useCreatePayment();
  const del = useDeletePayment();
  const [opened, { open, close }] = useDisclosure(false);

  const providerOptions = (providers ?? []).map((p) => ({ value: p.uuid, label: p.name }));
  const providerName = (uuid: string) => providers?.find((p) => p.uuid === uuid)?.name ?? '';

  const form = useForm<PForm>({
    initialValues: {
      providerUuid: '',
      serviceUuid: '',
      amount: '',
      currency: 'RUB',
      paymentDate: dayjs().format('YYYY-MM-DD'),
      description: '',
    },
    validate: {
      providerUuid: (v) => (v ? null : t('validation.selectProvider')),
      amount: (v) => (/^\d+(\.\d{1,2})?$/.test(v) ? null : t('validation.amountFormat')),
      paymentDate: (v) => (v ? null : t('validation.enterDate')),
    },
  });

  const formServices = useServices({ providerUuid: form.values.providerUuid || undefined });
  const serviceOptions = (formServices.data ?? []).map((s) => ({ value: s.uuid, label: s.name }));

  const openCreate = () => {
    form.setValues({
      providerUuid: providerOptions[0]?.value ?? '',
      serviceUuid: '',
      amount: '',
      currency: 'RUB',
      paymentDate: dayjs().format('YYYY-MM-DD'),
      description: '',
    });
    open();
  };

  const submit = form.onSubmit(async (v) => {
    try {
      await create.mutateAsync({
        providerUuid: v.providerUuid,
        serviceUuid: v.serviceUuid || undefined,
        amount: v.amount,
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
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t('payments.title')}</Title>
          <Text c="dimmed">{t('payments.subtitle')}</Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={openCreate}
          disabled={providerOptions.length === 0}
        >
          {t('common.add')}
        </Button>
      </Group>

      <Group align="flex-end">
        <Select
          label={t('payments.filterProvider')}
          placeholder={t('payments.filterAllProviders')}
          clearable
          data={providerOptions}
          value={filter.providerUuid ?? null}
          onChange={(v) => setFilter((f) => ({ ...f, providerUuid: v ?? undefined }))}
          w={220}
        />
        <DatePickerInput
          label={t('payments.filterFrom')}
          placeholder={t('payments.datePlaceholder')}
          valueFormat="DD.MM.YYYY"
          clearable
          w={160}
          value={filter.from ? dayjs(filter.from).format('YYYY-MM-DD') : null}
          onChange={(v) => setFilter((f) => ({ ...f, from: v ? toIso(v) : undefined }))}
        />
        <DatePickerInput
          label={t('payments.filterTo')}
          placeholder={t('payments.datePlaceholder')}
          valueFormat="DD.MM.YYYY"
          clearable
          w={160}
          value={filter.to ? dayjs(filter.to).format('YYYY-MM-DD') : null}
          onChange={(v) => setFilter((f) => ({ ...f, to: v ? toIso(v) : undefined }))}
        />
      </Group>

      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('payments.colDate')}</Table.Th>
              <Table.Th>{t('payments.colProvider')}</Table.Th>
              <Table.Th>{t('payments.colType')}</Table.Th>
              <Table.Th>{t('payments.colAmount')}</Table.Th>
              <Table.Th>{t('payments.colDescription')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {payments.map((p) => (
              <Table.Tr key={p.uuid}>
                <Table.Td>{formatDateShort(p.paymentDate)}</Table.Td>
                <Table.Td>{providerName(p.providerUuid)}</Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  <Badge
                    variant="light"
                    color={p.type === 'charge' ? 'gray' : 'teal'}
                    styles={{
                      root: { maxWidth: 'none', overflow: 'visible' },
                      label: { overflow: 'visible' },
                    }}
                  >
                    {p.type === 'charge' ? t('payments.typeCharge') : t('payments.typeTopup')}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text fw={600}>{formatMoney(p.amount, p.currency)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {p.description ?? t('common.none')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <ActionIcon variant="subtle" color="red" onClick={() => doDelete(p.uuid)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && total === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" ta="center" py="md">
                    {t('payments.empty')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {total > PAGE_SIZE && (
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {t('payments.total', { count: total })}
          </Text>
          <Pagination total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={setPage} />
        </Group>
      )}

      <Modal opened={opened} onClose={close} title={t('payments.modalTitle')}>
        <form onSubmit={submit}>
          <Stack>
            <Select
              label={t('payments.fieldProvider')}
              data={providerOptions}
              allowDeselect={false}
              {...form.getInputProps('providerUuid')}
            />
            <Select
              label={t('payments.fieldService', { optional: t('common.optional') })}
              placeholder={t('common.none')}
              clearable
              data={serviceOptions}
              {...form.getInputProps('serviceUuid')}
            />
            <Group grow>
              <TextInput
                label={t('payments.fieldAmount')}
                required
                {...form.getInputProps('amount')}
              />
              <Select
                label={t('payments.fieldCurrency')}
                data={enums.currencyOptions}
                allowDeselect={false}
                {...form.getInputProps('currency')}
              />
            </Group>
            <DatePickerInput
              label={t('payments.fieldDate')}
              required
              valueFormat="DD.MM.YYYY"
              placeholder={t('payments.datePlaceholder')}
              value={form.values.paymentDate || null}
              onChange={(v) => form.setFieldValue('paymentDate', v ?? '')}
              error={form.errors.paymentDate}
            />
            <Textarea
              label={t('payments.fieldDescription')}
              autosize
              minRows={2}
              {...form.getInputProps('description')}
            />
            <Button type="submit" loading={create.isPending}>
              {t('common.save')}
            </Button>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
