import { PasswordInput, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { NetcupAuthorizeButton } from '@/components/NetcupAuthorizeButton';
import type { FormValues } from './providerForm';

interface ProviderCredentialFieldsProps {
  form: UseFormReturnType<FormValues>;
  editing: boolean;
}

// The per-connector credential inputs, switched on the selected kind. Secret inputs use the
// "keep empty to keep unchanged" placeholder when editing.
export function ProviderCredentialFields({ form, editing }: ProviderCredentialFieldsProps) {
  const { t } = useTranslation();
  return form.values.kind === 'selectel' ? (
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
  ) : form.values.kind === 'cloudflare' ? (
    <>
      <TextInput
        label={t('providers.field.accountId')}
        description={t('providers.field.cloudflareAccountIdDesc')}
        {...form.getInputProps('accountId')}
      />
      <PasswordInput
        label={t('providers.field.apiToken')}
        description={t('providers.field.apiTokenDescCloudflare')}
        placeholder={editing ? t('providers.keepEmpty') : ''}
        {...form.getInputProps('token')}
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
      <TextInput label={t('providers.field.loginEmail')} {...form.getInputProps('username')} />
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
  ) : form.values.kind === 'vultr' ? (
    <TextInput
      label={t('providers.field.apiToken')}
      description={t('providers.field.apiTokenDescVultr')}
      placeholder={editing ? t('providers.keepEmpty') : ''}
      {...form.getInputProps('token')}
    />
  ) : form.values.kind === 'linode' ? (
    <TextInput
      label={t('providers.field.apiToken')}
      description={t('providers.field.apiTokenDescLinode')}
      placeholder={editing ? t('providers.keepEmpty') : ''}
      {...form.getInputProps('token')}
    />
  ) : form.values.kind === 'aeza' ? (
    <TextInput
      label={t('providers.field.apiToken')}
      description={t('providers.field.apiTokenDescAeza')}
      placeholder={editing ? t('providers.keepEmpty') : ''}
      {...form.getInputProps('token')}
    />
  ) : form.values.kind === 'stormwall' ? (
    <TextInput
      label={t('providers.field.apiToken')}
      description={t('providers.field.apiTokenDescStormwall')}
      placeholder={editing ? t('providers.keepEmpty') : ''}
      {...form.getInputProps('token')}
    />
  ) : form.values.kind === 'beget' ? (
    <>
      <TextInput
        label={t('providers.field.begetLogin')}
        description={t('providers.field.begetLoginDesc')}
        {...form.getInputProps('username')}
      />
      <PasswordInput
        label={t('providers.field.password')}
        placeholder={editing ? t('providers.keepEmpty') : ''}
        {...form.getInputProps('password')}
      />
      <PasswordInput
        label={t('providers.field.totpSecret')}
        description={t('providers.field.totpSecretDesc')}
        placeholder={editing ? t('providers.keepEmpty') : t('common.optional')}
        {...form.getInputProps('totpSecret')}
      />
      <PasswordInput
        label={t('providers.field.begetApiPassword')}
        description={t('providers.field.begetApiPasswordDesc')}
        placeholder={editing ? t('providers.keepEmpty') : t('common.optional')}
        {...form.getInputProps('apiPassword')}
      />
    </>
  ) : form.values.kind === 'porkbun' ? (
    <>
      <TextInput
        label={t('providers.field.porkbunApiKey')}
        description={t('providers.field.porkbunApiKeyDesc')}
        placeholder={editing ? t('providers.keepEmpty') : ''}
        {...form.getInputProps('token')}
      />
      <PasswordInput
        label={t('providers.field.porkbunSecretKey')}
        placeholder={editing ? t('providers.keepEmpty') : ''}
        {...form.getInputProps('secretKey')}
      />
    </>
  ) : (
    form.values.kind !== 'manual' && (
      <TextInput
        label={t('providers.field.apiToken')}
        placeholder={editing ? t('providers.keepEmpty') : ''}
        {...form.getInputProps('token')}
      />
    )
  );
}
