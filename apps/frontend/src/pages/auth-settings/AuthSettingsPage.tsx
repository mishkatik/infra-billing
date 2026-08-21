import { IconLoader2 } from '@tabler/icons-react';
import { useLayoutEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { Passkey } from '@infra/shared';
import { useMe } from '@/api/auth';
import {
  useAuthConfig,
  useDeletePasskey,
  usePasskeys,
  useRegisterPasskey,
  useUpdateAuthConfig,
} from '@/api/authSettings';
import { apiErrorMessage } from '@/api/client';
import { mapPasskeyError, passkeySupported } from '@/api/webauthn';
import { isAdmin } from '@/auth/permissions';
import { PageHeader } from '@/components/PageHeader';
import { useDisclosure } from '@/hooks/useDisclosure';
import { notifyError, notifySuccess } from '@/utils/notify';
import { AuthMethodsCard, type MethodsFormValues } from './AuthMethodsCard';
import { PasskeysCard } from './PasskeysCard';

export function AuthSettingsPage() {
  const me = useMe();
  if (me.isLoading) return null;
  return isAdmin(me.data) ? <AdminAuthSettings /> : <MemberAuthSettings />;
}

/** Members keep password login and skip GET /auth/config, which 403s for non-admins. */
function MemberAuthSettings() {
  const { t } = useTranslation();
  const { data: passkeys } = usePasskeys();
  const registerPasskey = useRegisterPasskey();
  const deletePasskey = useDeletePasskey();
  const canPasskey = passkeySupported();

  const addPasskey = async () => {
    try {
      await registerPasskey.mutateAsync(undefined);
      notifySuccess(t('auth.passkeys.added'));
    } catch (e) {
      const m = mapPasskeyError(e);
      if (!m.cancelled) notifyError(apiErrorMessage(e, m.message));
    }
  };

  const removePasskey = async (pk: Passkey) => {
    const label = pk.name ?? t('auth.passkeys.unnamed');
    if (!window.confirm(t('auth.passkeys.confirmDelete', { name: label }))) return;
    try {
      await deletePasskey.mutateAsync(pk.uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('auth.title')} subtitle={t('auth.subtitle')} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PasskeysCard
          passkeys={passkeys}
          canPasskey={canPasskey}
          adding={registerPasskey.isPending}
          removing={deletePasskey.isPending}
          onAdd={addPasskey}
          onRemove={removePasskey}
        />
      </div>
    </div>
  );
}

function AdminAuthSettings() {
  const { t } = useTranslation();
  const { data: config } = useAuthConfig();
  const { data: passkeys } = usePasskeys();
  const updateConfig = useUpdateAuthConfig();
  const registerPasskey = useRegisterPasskey();
  const deletePasskey = useDeletePasskey();

  const canPasskey = passkeySupported();
  const [pkOpen, pkDisc] = useDisclosure(false);

  const methodsForm = useForm<MethodsFormValues>({
    defaultValues: {
      passwordEnabled: true,
      passkeyEnabled: false,
      rpId: '',
      rpName: '',
      rpOrigin: '',
    },
    mode: 'onSubmit',
  });

  // useLayoutEffect (not useEffect) so the seeded values are committed before the browser paints.
  // react-hook-form's reset is referentially stable, so the effect still re-seeds only when the
  // config loads or refetches.
  const { reset } = methodsForm;
  useLayoutEffect(() => {
    if (!config) return;
    reset({
      passwordEnabled: config.passwordEnabled,
      passkeyEnabled: config.passkeyEnabled,
      rpId: config.rpId,
      rpName: config.rpName,
      rpOrigin: config.rpOrigin,
    });
  }, [config, reset]);

  const useCurrentHost = () => {
    const v = methodsForm.getValues();
    methodsForm.setValue('rpId', window.location.hostname);
    methodsForm.setValue('rpName', v.rpName || 'Infra Billing');
    methodsForm.setValue('rpOrigin', window.location.origin);
  };

  const saveMethods = async () => {
    const v = methodsForm.getValues();
    // Mirror the backend lockout invariant for instant feedback.
    if (!v.passwordEnabled && !v.passkeyEnabled) {
      notifyError(t('auth.methods.lastMethodError'));
      return;
    }
    if (!v.passwordEnabled && (passkeys?.length ?? 0) === 0) {
      notifyError(t('auth.methods.needPasskeyFirst'));
      return;
    }
    try {
      await updateConfig.mutateAsync({
        passwordEnabled: v.passwordEnabled,
        passkeyEnabled: v.passkeyEnabled,
        rpId: v.rpId,
        rpName: v.rpName,
        rpOrigin: v.rpOrigin,
      });
      notifySuccess(t('auth.methods.saved'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  // No name prompt: trigger the ceremony straight away. We auto-name the key ("Passkey", "Passkey 2", …).
  const addPasskey = async () => {
    try {
      await registerPasskey.mutateAsync(undefined);
      notifySuccess(t('auth.passkeys.added'));
    } catch (e) {
      const m = mapPasskeyError(e);
      if (!m.cancelled) notifyError(apiErrorMessage(e, m.message));
    }
  };

  const removePasskey = async (pk: Passkey) => {
    if (!config?.passwordEnabled && (passkeys?.length ?? 0) <= 1) {
      notifyError(t('auth.passkeys.lastMethodError'));
      return;
    }
    const label = pk.name ?? t('auth.passkeys.unnamed');
    if (!window.confirm(t('auth.passkeys.confirmDelete', { name: label }))) return;
    try {
      await deletePasskey.mutateAsync(pk.uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  // Wait for the real config before rendering toggles. Avoids a flash of the default
  // (password on / passkey off) state for a passkey-only owner.
  if (!config) {
    return (
      <div className="flex h-60 items-center justify-center">
        <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('auth.title')} subtitle={t('auth.subtitle')} />

      {/* items-start: expanding one card (passkey settings) must not stretch the other. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AuthMethodsCard
          form={methodsForm}
          pkOpen={pkOpen}
          onTogglePk={pkDisc.toggle}
          onUseCurrentHost={useCurrentHost}
          onSave={saveMethods}
          saving={updateConfig.isPending}
        />

        <PasskeysCard
          passkeys={passkeys}
          canPasskey={canPasskey}
          adding={registerPasskey.isPending}
          removing={deletePasskey.isPending}
          onAdd={addPasskey}
          onRemove={removePasskey}
        />
      </div>
    </div>
  );
}
