import {
  Button,
  Card,
  Center,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { IconCoin } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { loginSchema, type LoginInput } from '@infra/shared';
import { useLogin } from '@/api/auth';
import { apiErrorMessage } from '@/api/client';

export function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const form = useForm<LoginInput>({
    initialValues: { username: '', password: '' },
    validate: zodResolver(loginSchema),
  });

  return (
    <Center h="100vh">
      <Card withBorder radius="md" padding="xl" w={360}>
        <Stack align="center" gap="xs" mb="md">
          <ThemeIcon variant="light" color="brand" radius="md" size="lg">
            <IconCoin size={22} />
          </ThemeIcon>
          <Text fw={700} size="lg">
            Infra Billing
          </Text>
        </Stack>
        <form onSubmit={form.onSubmit((values) => login.mutate(values))}>
          <Stack>
            <TextInput label={t('login.username')} required {...form.getInputProps('username')} />
            <PasswordInput
              label={t('login.password')}
              required
              {...form.getInputProps('password')}
            />
            {login.isError && (
              <Text c="red" size="sm">
                {apiErrorMessage(login.error, t('login.failed'))}
              </Text>
            )}
            <Button type="submit" loading={login.isPending} fullWidth>
              {t('login.signIn')}
            </Button>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}
