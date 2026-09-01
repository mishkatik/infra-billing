import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@infra/shared';
import { IconArrowsShuffle, IconFingerprint, IconLoader2 } from '@tabler/icons-react';
import { lazy, Suspense, useLayoutEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLogin, usePasskeyLogin, useSetup, useSetupStatus } from '@/api/auth';
import { apiErrorMessage } from '@/api/client';
import { mapPasskeyError, passkeySupported } from '@/api/webauthn';
import { PasswordInput } from '@/components/PasswordInput';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { notifyError, notifySuccess } from '@/utils/notify';
import { generatePassword } from '@/utils/password';

// The Remotion scene is heavy — load it lazily; the backdrop and title share one chunk.
const LoginBackdrop = lazy(() =>
  import('@/components/login/LoginScene').then((m) => ({ default: m.LoginBackdrop })),
);
const LoginTitle = lazy(() =>
  import('@/components/login/LoginScene').then((m) => ({ default: m.LoginTitle })),
);

export function LoginPage() {
  const { t } = useTranslation();
  const status = useSetupStatus();

  // Keep the canvas near-black for the page's lifetime (see html.login-artwork in index.css):
  // the boot override from index.html is cleared by ThemeProvider, and without this class the
  // light-theme white canvas peeks through on overscroll. Layout effect = applied before paint.
  useLayoutEffect(() => {
    document.documentElement.classList.add('login-artwork');
    return () => document.documentElement.classList.remove('login-artwork');
  }, []);

  return (
    // Force the dark class: this artwork page is always dark regardless of the theme.
    <div className="dark relative min-h-svh bg-[#0a0a0c] text-foreground">
      <Suspense fallback={<div className="absolute inset-0 bg-[#0a0a0c]" />}>
        <LoginBackdrop />
      </Suspense>

      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-1 text-center">
            {/* Title with the remocn marker; a static h1 of the same height until the chunk loads. */}
            <div className="h-[72px] w-full">
              <Suspense
                fallback={
                  <h1 className="flex h-full items-center justify-center text-4xl font-extrabold tracking-tight text-white">
                    {t('app.brand')}
                  </h1>
                }
              >
                <LoginTitle />
              </Suspense>
            </div>
            <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
          </div>

          {status.isLoading ? (
            <div className="flex justify-center py-8">
              <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : status.data?.needsSetup ? (
            <SetupForm />
          ) : (
            <SignInForm
              passwordEnabled={
                (status.data?.passwordEnabled || status.data?.memberPasswordLogin) ?? true
              }
              passkeyEnabled={(status.data?.passkeyEnabled || status.data?.memberPasskeys) ?? false}
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
      <div className="text-center">
        <p className="font-semibold">{t('login.setup.title')}</p>
        <p className="text-sm text-muted-foreground">{t('login.setup.subtitle')}</p>
      </div>
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((v) => setup.mutate({ username: v.username, password: v.password }))}
      >
        <div className="space-y-2">
          <Label htmlFor="setup-username">
            {t('login.username')} <span className="text-destructive">*</span>
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
            {t('login.password')} <span className="text-destructive">*</span>
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
            {t('login.setup.confirm')} <span className="text-destructive">*</span>
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
              {t('login.username')} <span className="text-destructive">*</span>
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
              {t('login.password')} <span className="text-destructive">*</span>
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
          <span className="text-xs text-muted-foreground">{t('login.or')}</span>
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
          <p className="text-center text-xs text-muted-foreground">
            {t('auth.passkeys.unsupported')}
          </p>
        ))}
    </div>
  );
}
