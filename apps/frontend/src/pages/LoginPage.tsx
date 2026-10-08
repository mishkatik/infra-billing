import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@infra/shared';
import { IconArrowsShuffle, IconFingerprint, IconLoader2 } from '@tabler/icons-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLogin, usePasskeyLogin, useSetup, useSetupStatus } from '@/api/auth';
import { apiErrorMessage } from '@/api/client';
import { mapPasskeyError, passkeySupported } from '@/api/webauthn';
import { BrandWordmark } from '@/components/BrandWordmark';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PasswordInput } from '@/components/PasswordInput';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { notifyError, notifySuccess } from '@/utils/notify';
import { generatePassword } from '@/utils/password';

/**
 * Quiet sign-in: the brand above one white card centred on the stone canvas. It follows the
 * chosen theme like the rest of the app.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const status = useSetupStatus();
  const needsSetup = status.data?.needsSetup ?? false;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between gap-2 px-1">
          <BrandWordmark />
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>

        <div className="rounded-2xl bg-card p-8 shadow-xs">
          <h1 className="text-[15px] leading-none font-medium">
            {needsSetup ? t('login.setup.title') : t('login.signIn')}
          </h1>
          <p className="mt-2.5 mb-6 text-[13px] text-ink-2">
            {needsSetup ? t('login.setup.subtitle') : t('dashboard.subtitle')}
          </p>

          {status.isLoading ? (
            <div className="flex justify-center py-8">
              <IconLoader2 className="size-5 animate-spin text-ink-3" />
            </div>
          ) : needsSetup ? (
            <SetupForm />
          ) : (
            <SignInForm
              passwordEnabled={status.data?.passwordEnabled ?? true}
              passkeyEnabled={status.data?.passkeyEnabled ?? false}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface SetupValues {
  username: string;
  password: string;
  confirm: string;
}

function SetupForm() {
  const { t } = useTranslation();
  const setup = useSetup();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SetupValues>({
    defaultValues: { username: '', password: '', confirm: '' },
    mode: 'onSubmit',
  });

  // clipboard.writeText needs a secure context (https/localhost). If it fails, tell the owner
  // to copy manually instead of claiming a copy that didn't happen.
  const generate = async () => {
    const password = generatePassword();
    setValue('password', password);
    setValue('confirm', password);
    try {
      await navigator.clipboard.writeText(password);
      notifySuccess(t('login.setup.passwordGenerated'));
    } catch {
      notifySuccess(t('login.setup.passwordGeneratedNoCopy'));
    }
  };

  return (
    <div className="space-y-4">
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((v) => setup.mutate({ username: v.username, password: v.password }))}
      >
        <div className="space-y-2">
          <Label htmlFor="setup-username">
            {t('login.username')} <span className="text-ink-3">*</span>
          </Label>
          <Input
            id="setup-username"
            aria-invalid={errors.username ? true : undefined}
            {...register('username', {
              validate: (v) => v.trim().length >= 1 || t('validation.enterName'),
            })}
          />
          {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-password">
            {t('login.password')} <span className="text-ink-3">*</span>
          </Label>
          <PasswordInput
            id="setup-password"
            aria-invalid={errors.password ? true : undefined}
            {...register('password', {
              validate: (v) => v.length >= 8 || t('login.setup.passwordShort'),
            })}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-confirm">
            {t('login.setup.confirm')} <span className="text-ink-3">*</span>
          </Label>
          <PasswordInput
            id="setup-confirm"
            aria-invalid={errors.confirm ? true : undefined}
            {...register('confirm', {
              validate: (v, values) => v === values.password || t('login.setup.mismatch'),
            })}
          />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
        </div>
        <Button type="button" variant="secondary" className="w-full" onClick={generate}>
          <IconArrowsShuffle className="size-4" />
          {t('login.setup.generate')}
        </Button>
        {setup.isError && (
          <p className="text-sm text-destructive">
            {apiErrorMessage(setup.error, t('login.failed'))}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={setup.isPending}>
          {setup.isPending && <IconLoader2 className="size-4 animate-spin" />}
          {t('login.setup.submit')}
        </Button>
      </form>
    </div>
  );
}

function SignInForm({
  passwordEnabled,
  passkeyEnabled,
}: {
  passwordEnabled: boolean;
  passkeyEnabled: boolean;
}) {
  const { t } = useTranslation();
  const login = useLogin();
  const passkeyLogin = usePasskeyLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    defaultValues: { username: '', password: '' },
    mode: 'onSubmit',
    resolver: zodResolver(loginSchema),
  });

  const canPasskey = passkeyEnabled && passkeySupported();

  const doPasskey = async () => {
    try {
      await passkeyLogin.mutateAsync();
    } catch (e) {
      const m = mapPasskeyError(e);
      if (!m.cancelled) notifyError(apiErrorMessage(e, m.message));
    }
  };

  if (!passwordEnabled && !passkeyEnabled) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('login.noMethods')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {passwordEnabled && (
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => login.mutate(values))}
        >
          <div className="space-y-2">
            <Label htmlFor="login-username">
              {t('login.username')} <span className="text-ink-3">*</span>
            </Label>
            <Input
              id="login-username"
              aria-invalid={errors.username ? true : undefined}
              {...register('username')}
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">
              {t('login.password')} <span className="text-ink-3">*</span>
            </Label>
            <PasswordInput
              id="login-password"
              aria-invalid={errors.password ? true : undefined}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          {login.isError && (
            <p className="text-sm text-destructive">
              {apiErrorMessage(login.error, t('login.failed'))}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending && <IconLoader2 className="size-4 animate-spin" />}
            {t('login.signIn')}
          </Button>
        </form>
      )}

      {passwordEnabled && canPasskey && (
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-ink-3">{t('login.or')}</span>
          <Separator className="flex-1" />
        </div>
      )}

      {passkeyEnabled &&
        (canPasskey ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={passkeyLogin.isPending}
            onClick={doPasskey}
          >
            {passkeyLogin.isPending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconFingerprint className="size-4" />
            )}
            {t('login.passkey')}
          </Button>
        ) : (
          <p className="text-center text-xs text-ink-2">{t('auth.passkeys.unsupported')}</p>
        ))}
    </div>
  );
}
