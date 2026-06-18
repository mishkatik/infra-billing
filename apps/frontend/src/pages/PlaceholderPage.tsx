import { Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function PlaceholderPage({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs">
      <Title order={2}>{title}</Title>
      <Text c="dimmed">{t('placeholder.wip')}</Text>
    </Stack>
  );
}
