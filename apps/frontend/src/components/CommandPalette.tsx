import { IconLanguage, IconMoon, IconRefresh, IconSun } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '@/api/client';
import { useProjects } from '@/api/projects';
import { useProviders, useSyncActivity, useSyncAllProviders } from '@/api/providers';
import { useServices } from '@/api/services';
import { InkGlyph } from '@/components/ink/InkGlyph';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { NAV } from '@/layout/nav';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { notifyError } from '@/utils/notify';
import {
  SYNC_STATE_GLYPH,
  accountDisplayName,
  buildAccountIndex,
  providerSyncState,
} from '@/utils/providerState';
import { notifySyncAll } from '@/utils/syncNotify';

const META = 'ml-auto truncate pl-3 text-xs text-ink-3';

/**
 * Cmd/Ctrl+K: jump to a page or straight into a provider, service or project (their pages open
 * the record from ?selected=), plus a few global actions.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { resolved, setScheme } = useTheme();
  const { data: providers } = useProviders();
  const { data: projects } = useProjects();
  // Services are the one heavier list; load it only once the palette is actually opened.
  const { data: services } = useServices({}, { enabled: open });
  const activity = useSyncActivity();
  const syncAll = useSyncAllProviders();

  const accounts = buildAccountIndex(providers);
  const accountName = (accountUuid: string) => {
    const ref = accounts.get(accountUuid);
    return ref ? accountDisplayName(ref.provider, ref.account, t('common.accountMain')) : '';
  };
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const go = (to: string) => run(() => navigate(to));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('palette.title')}
      description={t('palette.description')}
      className="top-[18%] translate-y-0 rounded-2xl bg-popover shadow-lg sm:max-w-xl"
    >
      <CommandInput placeholder={t('palette.placeholder')} />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>{t('common.nothingFound')}</CommandEmpty>
        <CommandGroup heading={t('palette.pages')}>
          {NAV.flatMap((g) => g.items).map((it) => (
            <CommandItem
              key={it.to}
              value={`page ${t(it.labelKey)} ${it.to}`}
              onSelect={() => go(it.to)}
            >
              <it.icon stroke={1.5} className="text-ink-3" />
              <span>{t(it.labelKey)}</span>
              <span className={META}>{it.to}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {providers && providers.length > 0 && (
          <CommandGroup heading={t('nav.providers')}>
            {providers.map((p) => {
              const state = providerSyncState(p, activity);
              // Account labels are searchable too, so "veesp 2" finds the provider it lives under.
              const labels = p.accounts.map((a) => a.label ?? '').join(' ');
              return (
                <CommandItem
                  key={p.uuid}
                  value={`provider ${p.name} ${labels} ${p.kind} ${p.uuid}`}
                  onSelect={() => go(`/providers?selected=${p.uuid}`)}
                >
                  <InkGlyph state={SYNC_STATE_GLYPH[state]} label={t(`syncState.${state}`)} />
                  <span className="truncate">{p.name}</span>
                  {/* The connector kind is an identifier, so it keeps the code face. */}
                  <span className={cn(META, 'font-mono')}>{p.kind}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {services && services.length > 0 && (
          <CommandGroup heading={t('nav.services')}>
            {services.map((s) => (
              <CommandItem
                key={s.uuid}
                value={`service ${s.name} ${accountName(s.accountUuid)} ${s.uuid}`}
                onSelect={() => go(`/services?selected=${s.uuid}`)}
              >
                <InkGlyph
                  state={s.isActive ? 'ok' : 'off'}
                  label={t(s.isActive ? 'services.statusActive' : 'services.statusInactive')}
                />
                <span className="truncate">{s.name}</span>
                <span className={META}>{accountName(s.accountUuid)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {projects && projects.length > 0 && (
          <CommandGroup heading={t('nav.projects')}>
            {projects.map((p) => (
              <CommandItem
                key={p.uuid}
                value={`project ${p.name} ${p.uuid}`}
                onSelect={() => go(`/projects?selected=${p.uuid}`)}
              >
                <span className="truncate">{p.name}</span>
                <span className={META}>{p.servicesCount}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading={t('palette.actions')}>
          <CommandItem
            value={`action ${t('palette.syncAll')}`}
            disabled={syncAll.isPending}
            onSelect={() =>
              run(() =>
                syncAll.mutate(undefined, {
                  onSuccess: (r) => notifySyncAll(t, r),
                  onError: (e) => notifyError(apiErrorMessage(e)),
                }),
              )
            }
          >
            <IconRefresh stroke={1.5} className="text-ink-3" />
            <span>{t('palette.syncAll')}</span>
          </CommandItem>
          <CommandItem
            value={`action ${t('palette.toggleTheme')}`}
            onSelect={() => run(() => setScheme(resolved === 'dark' ? 'light' : 'dark'))}
          >
            {resolved === 'dark' ? (
              <IconSun stroke={1.5} className="text-ink-3" />
            ) : (
              <IconMoon stroke={1.5} className="text-ink-3" />
            )}
            <span>{t('palette.toggleTheme')}</span>
            <span className={META}>{resolved === 'dark' ? t('theme.light') : t('theme.dark')}</span>
          </CommandItem>
          <CommandItem
            value={`action ${t('palette.switchLanguage')}`}
            onSelect={() =>
              run(() => void i18n.changeLanguage(i18n.resolvedLanguage === 'ru' ? 'en' : 'ru'))
            }
          >
            <IconLanguage stroke={1.5} className="text-ink-3" />
            <span>{t('palette.switchLanguage')}</span>
            <span className={META}>
              {i18n.resolvedLanguage === 'ru' ? t('lang.en') : t('lang.ru')}
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
