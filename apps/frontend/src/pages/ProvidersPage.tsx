import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { notifyError, notifySuccess } from '@/utils/notify';
import {
  IconChartLine,
  IconEdit,
  IconExternalLink,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import type { Provider, ProviderKind } from '@infra/shared';
import {
  useCreateProvider,
  useDeleteProvider,
  useProviders,
  useSyncAllProviders,
  useSyncProvider,
  useUpdateProvider,
} from '@/api/providers';
import { useBalanceHistory } from '@/api/analytics';
import { apiErrorMessage } from '@/api/client';
import { useEnums } from '@/constants';
import { formatDate, formatDateShort, formatMoney } from '@/utils/format';
import { providerFavicon } from '@/utils/favicon';
import { ProviderIcon } from '@/components/ProviderIcon';
import { NetcupAuthorizeButton } from '@/components/NetcupAuthorizeButton';

interface FormValues {
  name: string;
  kind: string;
  token: string;
  loginUrl: string;
  baseUrl: string;
  username: string;
  password: string;
  totpSecret: string;
  accountId: string;
  projectName: string;
  panelId: string;
}

const EMPTY_FORM: FormValues = {
  name: '',
  kind: 'manual',
  token: '',
  loginUrl: '',
  baseUrl: '',
  username: '',
  password: '',
  totpSecret: '',
  accountId: '',
  projectName: '',
  panelId: '',
};

export function ProvidersPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: providers, isLoading } = useProviders();
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const del = useDeleteProvider();
  const sync = useSyncProvider();
  const syncAll = useSyncAllProviders();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [historyFor, setHistoryFor] = useState<Provider | null>(null);
  const history = useBalanceHistory(historyFor?.uuid);
  // Snapshots are taken on every sync (~6h), so collapse to one point per day — the day's last
  // snapshot — to match the "balance by day" chart and avoid repeated same-date axis labels.
  const dailyBalance = new Map<string, number>();
  for (const pt of history.data ?? [])
    dailyBalance.set(formatDateShort(pt.capturedAt), Number(pt.balance));
  const historyData = [...dailyBalance].map(([date, balance]) => ({ date, balance }));
  const latest = history.data?.[history.data.length - 1];
  const historyCurrency = latest?.currency ?? historyFor?.balanceCurrency ?? '';

  const form = useForm<FormValues>({
    initialValues: EMPTY_FORM,
    validate: { name: (v) => (v.trim() ? null : t('validation.enterName')) },
  });

  const openCreate = () => {
    setEditing(null);
    form.setValues({ ...EMPTY_FORM });
    open();
  };
  const openEdit = (p: Provider) => {
    setEditing(p);
    form.setValues({
      ...EMPTY_FORM,
      name: p.name,
      kind: p.kind,
      loginUrl: p.loginUrl ?? '',
      // Non-secret fields are prefilled; password/totpSecret stay blank ("keep unchanged").
      baseUrl: p.baseUrl ?? '',
      username: p.username ?? '',
      accountId: p.accountId ?? '',
      projectName: p.projectName ?? '',
      panelId: p.panelId ?? '',
    });
    open();
  };

  const submit = form.onSubmit(async (v) => {
    if (
      !editing &&
      (v.kind === 'hostbill' || v.kind === 'billmgr') &&
      !(v.baseUrl && v.username && v.password)
    ) {
      notifyError(t('providers.err.hostbillCreds'));
      return;
    }
    if (!editing && v.kind === 'selectel' && !(v.accountId && v.username && v.password)) {
      notifyError(t('providers.err.selectelCreds'));
      return;
    }
    if (!editing && v.kind === '4vps' && !v.token) {
      notifyError(t('providers.err.vps4Token'));
      return;
    }
    if (!editing && v.kind === 'netcup' && !v.token) {
      notifyError(t('providers.err.netcupToken'));
      return;
    }
    const creds = {
      token: v.token || undefined,
      baseUrl: v.baseUrl || undefined,
      username: v.username || undefined,
      password: v.password || undefined,
      totpSecret: v.totpSecret || undefined,
      accountId: v.accountId || undefined,
      projectName: v.projectName || undefined,
      panelId: v.panelId || undefined,
    };
    try {
      let saved: Provider;
      if (editing) {
        saved = await update.mutateAsync({
          uuid: editing.uuid,
          dto: { name: v.name, loginUrl: v.loginUrl || undefined, ...creds },
        });
      } else {
        saved = await create.mutateAsync({
          name: v.name,
          kind: v.kind as ProviderKind,
          loginUrl: v.loginUrl || undefined,
          ...creds,
        });
      }
      close();
      notifySuccess(editing ? t('providers.updated') : t('providers.created'));
      // Auto-sync syncable providers so credential/token changes take effect right away.
      if (saved.kind !== 'manual') void doSync(saved.uuid);
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doSyncAll = async () => {
    try {
      const res = await syncAll.mutateAsync();
      if (res.failed === 0) notifySuccess(t('providers.syncedAll', { count: res.ok }));
      else notifyError(t('providers.syncedMixed', { ok: res.ok, failed: res.failed }));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doSync = async (uuid: string) => {
    try {
      const run = await sync.mutateAsync(uuid);
      if (run.status === 'ok')
        notifySuccess(t('providers.syncedOne', { count: run.servicesFound }));
      else notifyError((run.error ?? '').slice(0, 200) || t('providers.syncFailed'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doDelete = async (p: Provider) => {
    if (!window.confirm(t('providers.confirmDelete', { name: p.name }))) return;
    try {
      await del.mutateAsync(p.uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t('providers.title')}</Title>
          <Text c="dimmed">{t('providers.subtitle')}</Text>
        </div>
        <Group>
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            loading={syncAll.isPending}
            onClick={doSyncAll}
          >
            {t('providers.syncAll')}
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            {t('common.add')}
          </Button>
        </Group>
      </Group>

      <Table.ScrollContainer minWidth={760}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('providers.th.name')}</Table.Th>
              <Table.Th>{t('providers.th.type')}</Table.Th>
              <Table.Th>{t('providers.th.balance')}</Table.Th>
              <Table.Th>{t('providers.th.services')}</Table.Th>
              <Table.Th>{t('providers.th.payments')}</Table.Th>
              <Table.Th>{t('providers.th.sync')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {providers?.map((p) => (
              <Table.Tr key={p.uuid}>
                <Table.Td>
                  <Group gap="xs">
                    <ProviderIcon name={p.name} src={providerFavicon(p)} />
                    <Text fw={600}>{p.name}</Text>
                    {p.loginUrl && (
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        component="a"
                        href={p.loginUrl}
                        target="_blank"
                      >
                        <IconExternalLink size={14} />
                      </ActionIcon>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={p.kind === 'manual' ? 'gray' : 'brand'}>
                    {enums.providerKindLabel(p.kind)}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatMoney(p.balance, p.balanceCurrency)}</Table.Td>
                <Table.Td>{p.servicesCount ?? 0}</Table.Td>
                <Table.Td>{p.paymentsCount ?? 0}</Table.Td>
                <Table.Td>
                  {p.lastSyncError ? (
                    <Tooltip label={p.lastSyncError} w={260} style={{ whiteSpace: 'normal' }}>
                      <Badge color="red" variant="light">
                        {t('providers.syncError')}
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Text size="sm" c="dimmed">
                      {formatDate(p.lastSyncAt)}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    {p.kind !== 'manual' && (
                      <Tooltip label={t('common.refresh')}>
                        <ActionIcon
                          variant="subtle"
                          loading={sync.isPending}
                          onClick={() => doSync(p.uuid)}
                        >
                          <IconRefresh size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {p.balance != null && (
                      <Tooltip label={t('providers.balanceHistory.tooltip')}>
                        <ActionIcon variant="subtle" onClick={() => setHistoryFor(p)}>
                          <IconChartLine size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <ActionIcon variant="subtle" onClick={() => openEdit(p)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => doDelete(p)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && providers?.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" ta="center" py="md">
                    {t('providers.empty')}
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
        title={editing ? t('providers.modalEdit') : t('providers.modalCreate')}
      >
        <form onSubmit={submit}>
          <Stack>
            <TextInput label={t('providers.field.name')} required {...form.getInputProps('name')} />
            {!editing && (
              <Select
                label={t('providers.field.type')}
                data={enums.providerKindOptions}
                allowDeselect={false}
                {...form.getInputProps('kind')}
              />
            )}
            {form.values.kind === 'selectel' ? (
              <>
                <TextInput
                  label={t('providers.field.accountId')}
                  description={t('providers.field.accountIdDesc')}
                  placeholder="123456"
                  {...form.getInputProps('accountId')}
                />
                <TextInput
                  label={t('providers.field.serviceUsername')}
                  description={t('providers.field.serviceUsernameDesc')}
                  {...form.getInputProps('username')}
                />
                <PasswordInput
                  label={t('providers.field.password')}
                  placeholder={editing ? t('providers.keepEmpty') : ''}
                  {...form.getInputProps('password')}
                />
                <TextInput
                  label={t('providers.field.project')}
                  description={t('providers.field.projectDesc')}
                  placeholder="my-project"
                  {...form.getInputProps('projectName')}
                />
              </>
            ) : form.values.kind === 'hostbill' || form.values.kind === 'billmgr' ? (
              <>
                <TextInput
                  label={t('providers.field.apiBaseUrl')}
                  placeholder={
                    form.values.kind === 'billmgr'
                      ? 'https://my.akenai.host/billmgr'
                      : 'https://secure.veesp.com/api'
                  }
                  {...form.getInputProps('baseUrl')}
                />
                <TextInput
                  label={t('providers.field.loginEmail')}
                  {...form.getInputProps('username')}
                />
                <PasswordInput
                  label={t('providers.field.password')}
                  placeholder={editing ? t('providers.keepEmpty') : ''}
                  {...form.getInputProps('password')}
                />
                {form.values.kind === 'billmgr' && (
                  <PasswordInput
                    label={t('providers.field.totpSecret')}
                    description={t('providers.field.totpSecretDesc')}
                    placeholder={editing ? t('providers.keepEmpty') : t('common.optional')}
                    {...form.getInputProps('totpSecret')}
                  />
                )}
              </>
            ) : form.values.kind === '4vps' ? (
              <>
                <TextInput
                  label={t('providers.field.apiToken')}
                  description={t('providers.field.apiTokenDesc4vps')}
                  placeholder={editing ? t('providers.keepEmpty') : ''}
                  {...form.getInputProps('token')}
                />
                <TextInput
                  label={t('providers.field.panelId')}
                  description={t('providers.field.panelIdDesc')}
                  placeholder="1"
                  {...form.getInputProps('panelId')}
                />
              </>
            ) : form.values.kind === 'netcup' ? (
              <>
                <NetcupAuthorizeButton onToken={(tok) => form.setFieldValue('token', tok)} />
                <TextInput
                  label={t('providers.field.refreshToken')}
                  description={t('providers.field.refreshTokenDescNetcup')}
                  placeholder={editing ? t('providers.keepEmpty') : ''}
                  {...form.getInputProps('token')}
                />
              </>
            ) : form.values.kind === 'netlen' ? (
              <TextInput
                label={t('providers.field.apiToken')}
                description={t('providers.field.apiTokenDescNetlen')}
                placeholder={editing ? t('providers.keepEmpty') : ''}
                {...form.getInputProps('token')}
              />
            ) : (
              form.values.kind !== 'manual' && (
                <TextInput
                  label={t('providers.field.apiToken')}
                  placeholder={editing ? t('providers.keepEmpty') : ''}
                  {...form.getInputProps('token')}
                />
              )
            )}
            <TextInput label={t('providers.field.loginUrl')} {...form.getInputProps('loginUrl')} />
            <Button type="submit" loading={create.isPending || update.isPending}>
              {t('common.save')}
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title={t('providers.balanceHistory.title', { name: historyFor?.name ?? '' })}
        size="lg"
      >
        {history.isLoading ? (
          <Text c="dimmed" py="md" ta="center">
            {t('common.loading')}
          </Text>
        ) : historyData.length >= 2 ? (
          <LineChart
            h={260}
            data={historyData}
            dataKey="date"
            series={[
              { name: 'balance', label: t('providers.balanceHistory.series'), color: 'brand.6' },
            ]}
            curveType="linear"
            withDots={historyData.length <= 60}
            valueFormatter={(v) => formatMoney(String(v), historyCurrency)}
            yAxisProps={{ tickFormatter: (v: number) => formatMoney(String(v)) }}
          />
        ) : latest ? (
          <Stack gap={2} py="lg" align="center">
            <Text size="xl" fw={700}>
              {formatMoney(latest.balance, historyCurrency)}
            </Text>
            <Text c="dimmed" size="sm">
              {formatDate(latest.capturedAt)}
            </Text>
            <Text c="dimmed" size="sm" ta="center" mt="xs">
              {t('providers.balanceHistory.notEnough')}
            </Text>
          </Stack>
        ) : (
          <Text c="dimmed" py="md" ta="center">
            {t('providers.balanceHistory.empty')}
          </Text>
        )}
      </Modal>
    </Stack>
  );
}
