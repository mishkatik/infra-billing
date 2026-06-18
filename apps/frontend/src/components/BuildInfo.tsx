import {
  ActionIcon,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconActivity, IconCheck, IconCopy } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useBuildInfo } from '@/api/buildInfo';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      {children}
    </Group>
  );
}

export function BuildInfo() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const { data } = useBuildInfo();
  const version = data?.version ?? '—';
  // "unknown" is what the build emits when not built from a git checkout.
  const commit = data?.gitCommit && data.gitCommit !== 'unknown' ? data.gitCommit : '';
  // "dev" = the build-arg default (not a tagged release) — flag it with a highlighted "DEV" badge.
  const isDev = version === 'dev';
  const label = isDev ? 'DEV' : `v${version}`;

  return (
    <>
      <Button
        variant={isDev ? 'light' : 'subtle'}
        color={isDev ? 'brand' : 'gray'}
        size="compact-sm"
        leftSection={<IconActivity size={16} />}
        onClick={open}
        styles={isDev ? { label: { letterSpacing: '0.1em', fontWeight: 700 } } : undefined}
      >
        {label}
      </Button>

      <Modal opened={opened} onClose={close} title={t('build.about')} size="sm" centered>
        <Stack gap="sm">
          <Group>
            <Badge variant="light" color="brand" size="lg">
              {label}
            </Badge>
          </Group>
          <Row label={t('build.date')}>
            <Text size="sm">
              {data?.buildTime ? dayjs(data.buildTime).format('DD.MM.YYYY HH:mm') : '—'}
            </Text>
          </Row>
          <Row label={t('build.commit')}>
            {commit ? (
              <CopyButton value={commit}>
                {({ copied, copy }) => (
                  <Group gap={6} wrap="nowrap">
                    <Code>{commit.slice(0, 8)}</Code>
                    <Tooltip label={copied ? t('build.copied') : t('build.copy')}>
                      <ActionIcon variant="subtle" color="gray" size="sm" onClick={copy}>
                        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                )}
              </CopyButton>
            ) : (
              <Text size="sm">—</Text>
            )}
          </Row>
          <Row label={t('build.node')}>
            <Text size="sm">{data?.nodeVersion ?? '—'}</Text>
          </Row>
        </Stack>
      </Modal>
    </>
  );
}
