import { IconLoader2 } from '@tabler/icons-react';
import { lazy, Suspense, useLayoutEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { InviteInfo } from '@infra/shared';
import { useClaimInvite, useInviteInfo } from '@/api/accounts';
import { apiErrorMessage } from '@/api/client';
import { PasswordInput } from '@/components/PasswordInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Same lazily-loaded artwork as LoginPage — this page is reached by an anonymous invitee and
// should look like the same product, not a bare form.
const LoginBackdrop = lazy(() =>
  import('@/components/login/LoginScene').then((m) => ({ default: m.LoginBackdrop })),
);
const LoginTitle = lazy(() =>
  import('@/components/login/LoginScene').then((m) => ({ default: m.LoginTitle })),
);

export function InvitePage() {
  const { t } = useTranslation();
  const { token = '' } = useParams<{ token: string }>();
  const info = useInviteInfo(token);

  useLayoutEffect(() => {
    document.documentElement.classList.add('login-artwork');
    return () => document.documentElement.classList.remove('login-artwork');
  }, []);

  return (
    <div className="dark relative min-h-svh bg-[#0a0a0c] text-foreground">
      <Suspense fallback={<div className="absolute inset-0 bg-[#0a0a0c]" />}>
        <LoginBackdrop />
      </Suspense>

      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-1 text-center">
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
          </div>

          {info.isLoading ? (
            <div className="flex justify-center py-8">
              <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : info.isError || !info.data ? (
            <InvalidLink />
          ) : (
            <ClaimForm token={token} info={info.data} />
          )}
        </div>
      </div>
    </div>
  );
}

function InvalidLink() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted-foreground">{t('invite.invalid')}</p>
      <Button asChild className="w-full">
        <Link to="/login">{t('invite.backToLogin')}</Link>
      </Button>
    </div>
  );
}

interface ClaimValues {
  username: string;
  password: string;
  confirm: string;
}

function ClaimForm({ token, info }: { token: string; info: InviteInfo }) {
  const { t } = useTranslation();
  const claim = useClaimInvite(token);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClaimValues>({
    defaultValues: { username: '', password: '', confirm: '' },
    mode: 'onSubmit',
  });

  const isInvite = info.mode === 'invite';

  const submit = handleSubmit(async (v) => {
    try {
      await claim.mutateAsync({
        ...(isInvite ? { username: v.username.trim() } : {}),
        password: v.password,
      });
    } catch {
      // surfaced below via claim.isError
    }
  });

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="font-semibold">{t(isInvite ? 'invite.titleInvite' : 'invite.titleReset')}</p>
        <p className="text-sm text-muted-foreground">
          {t(isInvite ? 'invite.subtitleInvite' : 'invite.subtitleReset')}
        </p>
      </div>
      <form noValidate className="space-y-4" onSubmit={submit}>
        {isInvite ? (
          <div className="space-y-2">
            <Label htmlFor="invite-username">
              {t('login.username')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invite-username"
              autoFocus
              autoComplete="username"
              aria-invalid={errors.username ? true : undefined}
              {...register('username', {
                validate: (v) => {
                  const trimmed = v.trim();
                  if (!trimmed) return t('validation.enterName');
                  if (trimmed.length > 64) return t('validation.usernameLength');
                  return true;
                },
              })}
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="invite-username-locked">{t('login.username')}</Label>
            <Input id="invite-username-locked" value={info.username ?? ''} disabled readOnly />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="invite-password">
            {t('login.password')} <span className="text-destructive">*</span>
          </Label>
          <PasswordInput
            id="invite-password"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            {...register('password', {
              validate: (v) => (v.length >= 8 && v.length <= 128) || t('validation.passwordLength'),
            })}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-confirm">
            {t('login.setup.confirm')} <span className="text-destructive">*</span>
          </Label>
          <PasswordInput
            id="invite-confirm"
            autoComplete="new-password"
            aria-invalid={errors.confirm ? true : undefined}
            {...register('confirm', {
              validate: (v, values) => v === values.password || t('login.setup.mismatch'),
            })}
          />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
        </div>
        {claim.isError && (
          <p className="text-sm text-destructive">
            {apiErrorMessage(claim.error, t('invite.failed'))}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={claim.isPending}>
          {claim.isPending && <IconLoader2 className="size-4 animate-spin" />}
          {t(isInvite ? 'invite.submitInvite' : 'invite.submitReset')}
        </Button>
      </form>
    </div>
  );
}
