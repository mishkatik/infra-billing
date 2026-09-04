import { IconActivity, IconArrowUpRight, IconCheck, IconCopy } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBuildInfo } from '@/api/buildInfo';
import {
  GITHUB_RELEASES_URL,
  githubCommitUrl,
  githubReleaseUrl,
  useLatestRelease,
} from '@/api/github';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isNewerVersion } from '@/lib/version';

const DATE_FORMAT = 'DD.MM.YYYY HH:mm';

// Copy with a short "copied" flash. `navigator.clipboard` is missing on plain-http LAN origins,
// so a failed copy just leaves the button as it was.
function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return [copied, copy];
}

function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className={className}
          onClick={() => copy(text)}
        >
          {copied ? (
            <IconCheck className="size-3.5 text-success" />
          ) : (
            <IconCopy className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? t('build.copied') : label}</TooltipContent>
    </Tooltip>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

type Status = 'dev' | 'update' | 'current' | 'unknown' | 'pending';

const STATUS_DOT: Record<Status, string> = {
  dev: 'bg-brand',
  update: 'bg-brand',
  current: 'bg-success',
  unknown: '',
  pending: '',
};

export function BuildInfo() {
  const { t } = useTranslation();
  const { data, isPending } = useBuildInfo();
  const version = data?.version ?? '';
  // "dev" is the build-arg default (not a tagged release): nothing to compare against.
  const isDev = version === 'dev';
  const release = useLatestRelease(version !== '' && !isDev);
  const latest = release.data;
  const hasUpdate = !isDev && latest != null && isNewerVersion(latest, version);

  if (isPending) return <Skeleton className="h-8 w-[84px] rounded-full" />;
  if (!data) return null;

  // "" is the env default, "unknown" is what the Makefile passes outside a git checkout.
  const commit = data.gitCommit && data.gitCommit !== 'unknown' ? data.gitCommit : '';
  const built = data.buildTime ? dayjs(data.buildTime) : null;
  const builtAt = built?.isValid() ? built : null;
  const label = isDev ? 'DEV' : `v${version}`;
  const releaseUrl = isDev ? GITHUB_RELEASES_URL : githubReleaseUrl(version);

  let status: Status = 'pending';
  if (isDev) status = 'dev';
  else if (hasUpdate) status = 'update';
  else if (latest) status = 'current';
  else if (release.isError) status = 'unknown';
  const statusText: Record<Status, string> = {
    dev: t('build.devBuild'),
    update: t('build.updateAvailable', { version: latest }),
    current: t('build.upToDate'),
    unknown: t('build.checkUnavailable'),
    pending: '',
  };

  const none = t('common.none');
  const plainText = [
    `${t('app.brand')} ${label}`,
    `${t('build.date')}: ${builtAt ? `${builtAt.format(DATE_FORMAT)} (${data.buildTime})` : none}`,
    `${t('build.commit')}: ${commit || none}`,
    `${t('build.node')}: ${data.nodeVersion || none}`,
  ].join('\n');

  return (
    <HoverCard openDelay={200} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-label={isDev ? t('build.allReleases') : t('build.openRelease', { version })}
          className={cn(
            'rounded-full text-muted-foreground hover:-translate-y-px hover:border-brand hover:shadow-[0_2px_12px_-6px_var(--brand)] dark:hover:border-brand',
            // Keep the raised brand look while the card is open (the pointer is on the card).
            'data-[state=open]:-translate-y-px data-[state=open]:border-brand data-[state=open]:shadow-[0_2px_12px_-6px_var(--brand)] dark:data-[state=open]:border-brand',
            hasUpdate && 'version-pill-update border-brand text-foreground dark:border-brand',
            // The outline variant carries dark:border-input/dark:bg-input; override both explicitly.
            isDev &&
              'border-transparent bg-brand/15 font-bold tracking-[0.1em] text-brand hover:bg-brand/25 hover:text-brand dark:border-transparent dark:bg-brand/15 dark:hover:bg-brand/25',
          )}
        >
          <a href={releaseUrl} target="_blank" rel="noopener noreferrer">
            <IconActivity className="size-4" />
            <span className="tabular-nums">{label}</span>
            {hasUpdate ? <span aria-hidden className="size-1.5 rounded-full bg-brand" /> : null}
          </a>
        </Button>
      </HoverCardTrigger>

      {/* Radix HoverCard is a pointer preview: it sets tabindex=-1 on everything inside, so the
          copy buttons and links here are mouse-only. The pill itself is the keyboard path. */}
      <HoverCardContent align="end" sideOffset={8} collisionPadding={8} className="w-80 p-0">
        <div className="flex items-start gap-3 border-b p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
            <IconActivity className="size-5" stroke={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl leading-tight font-extrabold tracking-tight tabular-nums">
              {label}
            </p>
            {statusText[status] ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                {STATUS_DOT[status] ? (
                  <span
                    aria-hidden
                    className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status])}
                  />
                ) : null}
                {statusText[status]}
              </p>
            ) : null}
          </div>
          <CopyButton text={plainText} label={t('build.copyAll')} className="-mt-1 -mr-1" />
        </div>

        {hasUpdate && latest ? (
          <a
            href={githubReleaseUrl(latest)}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-4 mt-4 flex items-center justify-between gap-2 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10"
          >
            <span>{t('build.whatsNew', { version: latest })}</span>
            <IconArrowUpRight className="size-4 shrink-0" />
          </a>
        ) : null}

        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-2.5 p-4 text-sm">
          <Fact label={t('build.date')}>
            {builtAt ? (
              <>
                <span className="tabular-nums">{builtAt.format(DATE_FORMAT)}</span>
                <span className="block text-xs text-muted-foreground">{builtAt.fromNow()}</span>
              </>
            ) : (
              none
            )}
          </Fact>
          <Fact label={t('build.commit')}>
            {commit ? (
              <span className="flex items-center gap-1.5">
                <a
                  href={githubCommitUrl(commit)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs transition-colors hover:text-brand"
                >
                  {commit.slice(0, 7)}
                </a>
                <CopyButton text={commit} label={t('build.copy')} />
              </span>
            ) : (
              none
            )}
          </Fact>
          <Fact label={t('build.node')}>{data.nodeVersion || none}</Fact>
        </dl>

        <div className="border-t bg-muted/40 p-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-between font-medium">
            <a href={releaseUrl} target="_blank" rel="noopener noreferrer">
              {isDev ? t('build.allReleases') : t('build.releaseNotes', { version })}
              <IconArrowUpRight className="size-4 text-muted-foreground" />
            </a>
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
