import { useEffect } from 'react';
import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { notifyError, notifySuccess } from '@/utils/notify';
import { IconBrandTelegram, IconPlus, IconRefresh, IconSend } from '@tabler/icons-react';
import type { RateSource } from '@infra/shared';
import { useSettings, useUpdateSettings, useTestTelegram } from '@/api/settings';
import { useAddRate, useRates, useRefreshRates } from '@/api/rates';
import { apiErrorMessage } from '@/api/client';
import { CURRENCY_OPTIONS, useEnums } from '@/constants';
import { formatDate } from '@/utils/format';

interface SettingsForm {
  baseCurrency: string;
  syncIntervalHours: number;
  rateSource: string;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const testTelegram = useTestTelegram();
  const { data: rates } = useRates();
  const addRate = useAddRate();
  const refresh = useRefreshRates();

  const rateSourceOptions = [
    { value: 'cbr', label: enums.rateSourceLabel('cbr') },
    { value: 'manual', label: enums.rateSourceLabel('manual') },
  ];

  const form = useForm<SettingsForm>({
    initialValues: { baseCurrency: 'RUB', syncIntervalHours: 6, rateSource: 'cbr' },
  });
  const tgForm = useForm({
    initialValues: {
      notificationsEnabled: false,
      telegramBotToken: '',
      telegramChatId: '',
      telegramTopicId: '',
      upcomingBillingDays: 3,
    },
  });
  const rateForm = useForm({
    initialValues: { code: '', rate: '' },
    validate: {
      code: (v) => (/^[A-Za-z]{3}$/.test(v) ? null : t('validation.code3')),
      rate: (v) => (/^\d+(\.\d{1,8})?$/.test(v) ? null : t('validation.ratePositive')),
    },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed the forms only when settings load
  useEffect(() => {
    if (!settings) return;
    form.setValues({
      baseCurrency: settings.baseCurrency,
      syncIntervalHours: settings.syncIntervalHours,
      rateSource: settings.rateSource,
    });
    // Token is write-only — never prefilled; the rest are.
    tgForm.setValues({
      notificationsEnabled: settings.notificationsEnabled,
      telegramBotToken: '',
      telegramChatId: settings.telegramChatId ?? '',
      telegramTopicId: settings.telegramTopicId ?? '',
      upcomingBillingDays: settings.upcomingBillingDays,
    });
  }, [settings]);

  const saveSettings = form.onSubmit(async (v) => {
    try {
      await updateSettings.mutateAsync({
        baseCurrency: v.baseCurrency,
        syncIntervalHours: v.syncIntervalHours,
        rateSource: v.rateSource as RateSource,
      });
      notifySuccess(t('settings.settingsSaved'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const saveTelegram = tgForm.onSubmit(async (v) => {
    try {
      await updateSettings.mutateAsync({
        notificationsEnabled: v.notificationsEnabled,
        telegramBotToken: v.telegramBotToken || undefined, // empty = keep existing
        telegramChatId: v.telegramChatId,
        telegramTopicId: v.telegramTopicId,
        upcomingBillingDays: v.upcomingBillingDays,
      });
      tgForm.setFieldValue('telegramBotToken', '');
      notifySuccess(t('settings.telegram.saved'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doTestTelegram = async () => {
    try {
      const res = await testTelegram.mutateAsync();
      if (res.sent) notifySuccess(t('settings.telegram.samplesSent', { count: res.sent }));
      else if (!res.enabled) notifyError(t('settings.telegram.notConfiguredError'));
      else notifyError(t('settings.telegram.sendFailed'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const submitRate = rateForm.onSubmit(async (v) => {
    try {
      await addRate.mutateAsync({ code: v.code.toUpperCase(), rate: v.rate });
      rateForm.reset();
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

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>{t('settings.title')}</Title>
        <Text c="dimmed">{t('settings.subtitle')}</Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card withBorder radius="md" padding="lg">
          <form onSubmit={saveSettings}>
            <Stack>
              <Select
                label={t('settings.baseCurrency')}
                data={CURRENCY_OPTIONS}
                allowDeselect={false}
                {...form.getInputProps('baseCurrency')}
              />
              <NumberInput
                label={t('settings.syncInterval')}
                min={1}
                max={168}
                {...form.getInputProps('syncIntervalHours')}
              />
              <Select
                label={t('settings.rateSource')}
                data={rateSourceOptions}
                allowDeselect={false}
                {...form.getInputProps('rateSource')}
              />
              <Group justify="flex-end">
                <Button type="submit" loading={updateSettings.isPending}>
                  {t('common.save')}
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Group gap="xs" mb="md">
            <IconBrandTelegram size={20} />
            <Text fw={600}>{t('settings.telegram.title')}</Text>
            {settings?.telegramConfigured ? (
              <Badge color="teal" variant="light">
                {t('settings.telegram.tokenSet')}
              </Badge>
            ) : (
              <Badge color="gray" variant="light">
                {t('settings.telegram.notConfigured')}
              </Badge>
            )}
          </Group>
          <form onSubmit={saveTelegram}>
            <Stack>
              <Switch
                label={t('settings.telegram.enabled')}
                description={t('settings.telegram.enabledDescription')}
                checked={tgForm.values.notificationsEnabled}
                onChange={(e) =>
                  tgForm.setFieldValue('notificationsEnabled', e.currentTarget.checked)
                }
              />
              <PasswordInput
                label={t('settings.telegram.botToken')}
                description={t('settings.telegram.botTokenDescription')}
                placeholder={
                  settings?.telegramConfigured
                    ? t('settings.telegram.botTokenPlaceholderSet')
                    : t('settings.telegram.botTokenPlaceholderNew')
                }
                {...tgForm.getInputProps('telegramBotToken')}
              />
              <TextInput
                label={t('settings.telegram.chatId')}
                description={t('settings.telegram.chatIdDescription')}
                placeholder={t('settings.telegram.chatIdPlaceholder')}
                {...tgForm.getInputProps('telegramChatId')}
              />
              <TextInput
                label={t('settings.telegram.topicId')}
                description={t('settings.telegram.topicIdDescription')}
                {...tgForm.getInputProps('telegramTopicId')}
              />
              <NumberInput
                label={t('settings.telegram.upcomingBillingDays')}
                min={1}
                max={60}
                {...tgForm.getInputProps('upcomingBillingDays')}
              />
              <Group justify="space-between">
                <Button
                  variant="default"
                  leftSection={<IconSend size={16} />}
                  loading={testTelegram.isPending}
                  onClick={doTestTelegram}
                >
                  {t('settings.telegram.sendSamples')}
                </Button>
                <Button type="submit" loading={updateSettings.isPending}>
                  {t('common.save')}
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between" mb="md">
          <Text fw={600}>{t('settings.rates.title')}</Text>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            loading={refresh.isPending}
            onClick={doRefresh}
          >
            {t('settings.rates.refreshFromCbr')}
          </Button>
        </Group>

        <form onSubmit={submitRate}>
          <Group align="flex-end" mb="md">
            <TextInput
              label={t('settings.rates.code')}
              placeholder={t('settings.rates.codePlaceholder')}
              w={120}
              {...rateForm.getInputProps('code')}
            />
            <TextInput
              label={t('settings.rates.rate')}
              placeholder={t('settings.rates.ratePlaceholder')}
              w={160}
              {...rateForm.getInputProps('rate')}
            />
            <Button
              type="submit"
              variant="default"
              leftSection={<IconPlus size={16} />}
              loading={addRate.isPending}
            >
              {t('settings.rates.addManual')}
            </Button>
          </Group>
        </form>

        <Table.ScrollContainer minWidth={420}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('settings.rates.thCurrency')}</Table.Th>
                <Table.Th>{t('settings.rates.thRate')}</Table.Th>
                <Table.Th>{t('settings.rates.thSource')}</Table.Th>
                <Table.Th>{t('settings.rates.thUpdated')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rates?.map((r) => (
                <Table.Tr key={r.code}>
                  <Table.Td>{r.code}</Table.Td>
                  <Table.Td>{r.rate}</Table.Td>
                  <Table.Td>
                    {r.source === 'cbr'
                      ? t('settings.rates.sourceCbr')
                      : t('settings.rates.sourceManual')}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatDate(r.capturedAt)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
