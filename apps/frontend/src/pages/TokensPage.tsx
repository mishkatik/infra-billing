import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconCheck, IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import type { ApiToken, CreatedApiToken } from '@infra/shared';
import { useCreateToken, useDeleteToken, useTokens } from '@/api/tokens';
import { apiErrorMessage } from '@/api/client';
import { notifyError, notifySuccess } from '@/utils/notify';
import { formatDateShort } from '@/utils/format';

export function TokensPage() {
  const { t } = useTranslation();
  const { data: tokens, isLoading } = useTokens();
  const create = useCreateToken();
  const del = useDeleteToken();
  const [opened, { open, close }] = useDisclosure(false);
  // The raw token, captured from the create response — shown once, then cleared.
  const [created, setCreated] = useState<CreatedApiToken | null>(null);

  const form = useForm<{ tokenName: string }>({
    initialValues: { tokenName: '' },
    validate: { tokenName: (v) => (v.trim() ? null : t('validation.enterName')) },
  });

  const openCreate = () => {
    form.setValues({ tokenName: '' });
    open();
  };

  const submit = form.onSubmit(async (v) => {
    try {
      const res = await create.mutateAsync({ tokenName: v.tokenName.trim() });
      close();
      setCreated(res); // open the one-time reveal — the raw token isn't recoverable afterwards
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doDelete = async (tok: ApiToken) => {
    if (!window.confirm(t('tokens.confirmDelete', { name: tok.tokenName }))) return;
    try {
      await del.mutateAsync(tok.uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t('tokens.title')}</Title>
          <Text c="dimmed">{t('tokens.subtitle')}</Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          {t('common.add')}
        </Button>
      </Group>

      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('tokens.colName')}</Table.Th>
              <Table.Th>{t('tokens.colToken')}</Table.Th>
              <Table.Th>{t('tokens.colCreated')}</Table.Th>
              <Table.Th>{t('tokens.colLastUsed')}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tokens?.map((tok) => (
              <Table.Tr key={tok.uuid}>
                <Table.Td>
                  <Text fw={600}>{tok.tokenName}</Text>
                </Table.Td>
                <Table.Td>
                  <Code>{`${tok.tokenPrefix}…`}</Code>
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {formatDateShort(tok.createdAt)}
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {tok.lastUsedAt ? formatDateShort(tok.lastUsedAt) : t('tokens.lastUsedNever')}
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <ActionIcon variant="subtle" color="red" onClick={() => doDelete(tok)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {!isLoading && tokens?.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" ta="center" py="md">
                    {t('tokens.empty')}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={opened} onClose={close} title={t('tokens.modalCreate')}>
        <form onSubmit={submit}>
          <Stack>
            <TextInput
              label={t('tokens.fieldName')}
              placeholder={t('tokens.namePlaceholder')}
              required
              data-autofocus
              {...form.getInputProps('tokenName')}
            />
            <Button type="submit" loading={create.isPending}>
              {t('tokens.create')}
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={!!created}
        onClose={() => setCreated(null)}
        title={t('tokens.reveal.title')}
        closeOnClickOutside={false}
      >
        <Stack>
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
            {t('tokens.reveal.warning')}
          </Alert>
          <CopyButton value={created?.token ?? ''}>
            {({ copied, copy }) => (
              <Group gap={6} wrap="nowrap">
                <Code style={{ flex: 1, wordBreak: 'break-all' }}>{created?.token}</Code>
                <Tooltip label={copied ? t('tokens.copied') : t('tokens.copy')}>
                  <ActionIcon variant="subtle" color="gray" onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              </Group>
            )}
          </CopyButton>
          <Button onClick={() => setCreated(null)}>{t('tokens.reveal.done')}</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
