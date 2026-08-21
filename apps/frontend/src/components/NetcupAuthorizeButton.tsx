import type { NetcupDeviceStart } from '@infra/shared';
import { IconBrandOauth, IconExternalLink, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNetcupDevicePoll, useNetcupDeviceStart } from '@/api/providers';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { notifyError, notifySuccess } from '@/utils/notify';

type Phase = 'idle' | 'waiting' | 'authorized' | 'error';

/** Return the URL only if it is a real http(s) URL, else null (no javascript:/empty hrefs). */
function httpUrl(u: string): string | null {
  try {
    const { protocol } = new URL(u);
    return protocol === 'https:' || protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

// netcup OAuth2 device flow in-panel: shows verification link + user code, polls until the
// owner approves, then hands the minted refresh token to the parent form via onToken.
export function NetcupAuthorizeButton({
  onToken,
  disabled,
}: {
  onToken: (token: string) => void;
  // Device-flow endpoints are admin-only server-side — members with providers:edit keep the
  // button visible (the description below still points at it) but disabled, same as the
  // credentials-reveal eye button; they fall back to pasting a refresh token manually.
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const startMut = useNetcupDeviceStart();
  const pollMut = useNetcupDevicePoll();
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<NetcupDeviceStart | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const timerRef = useRef<number | null>(null);
  const cancelled = useRef(false);

  // Stop polling if the modal closes / component unmounts.
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const fail = (msg: string) => {
    setPhase('error');
    setErrMsg(msg);
    notifyError(msg);
  };

  const schedulePoll = (deviceCode: string, interval: number, deadline: number) => {
    timerRef.current = window.setTimeout(async () => {
      if (cancelled.current) return;
      try {
        const r = await pollMut.mutateAsync(deviceCode);
        if (cancelled.current) return;
        if (r.status === 'authorized' && r.refreshToken) {
          setPhase('authorized');
          onToken(r.refreshToken);
          notifySuccess(t('providers.netcup.authorized'));
          return;
        }
        if (r.status === 'pending') {
          if (Date.now() < deadline) schedulePoll(deviceCode, interval, deadline);
          else fail(t('providers.netcup.expired'));
          return;
        }
        fail(r.message || t('providers.netcup.failed'));
      } catch {
        if (cancelled.current) return;
        // Transient network error → keep trying until the code expires.
        if (Date.now() < deadline) schedulePoll(deviceCode, interval, deadline);
        else fail(t('providers.netcup.failed'));
      }
    }, interval * 1000);
  };

  const authorize = async () => {
    if (disabled) return;
    setErrMsg('');
    setPhase('waiting');
    try {
      const d = await startMut.mutateAsync();
      if (cancelled.current) return;
      setInfo(d);
      schedulePoll(d.deviceCode, d.interval, Date.now() + d.expiresIn * 1000);
    } catch {
      if (cancelled.current) return;
      fail(t('providers.netcup.startFailed'));
    }
  };

  if (phase === 'authorized') {
    return <p className="text-sm text-success">{t('providers.netcup.authorized')}</p>;
  }

  if (phase === 'waiting' && info) {
    // Only ever render an http(s) link (never a javascript:/empty href from a tampered response).
    const safeUrl = httpUrl(info.verificationUriComplete);
    return (
      <Alert className="border-primary/25 bg-primary/5">
        <AlertTitle>{t('providers.netcup.instructions')}</AlertTitle>
        <AlertDescription>
          <div className="space-y-2">
            {safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
              >
                <IconExternalLink className="size-4" />
                {t('providers.netcup.openLink')}
              </a>
            ) : (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {info.verificationUriComplete || info.verificationUri}
              </code>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm">{t('providers.netcup.code')}</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {info.userCode}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <IconLoader2 className="size-3.5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('providers.netcup.waiting')}</span>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="ghost"
        className="w-full bg-brand/10 text-brand hover:bg-brand/20 hover:text-brand"
        disabled={disabled || phase === 'waiting'}
        onClick={authorize}
      >
        {phase === 'waiting' ? (
          <IconLoader2 className="size-4 animate-spin" />
        ) : (
          <IconBrandOauth className="size-4" />
        )}
        {phase === 'error' ? t('providers.netcup.retry') : t('providers.netcup.authorize')}
      </Button>
      {phase === 'error' && <p className="text-xs text-destructive">{errMsg}</p>}
    </div>
  );
}
