import { IconLogout } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { useSummary } from '@/api/analytics';
import { useLogout, useMe } from '@/api/auth';
import { useProviders, useSyncActivity } from '@/api/providers';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { InkMeter } from '@/components/ink/InkMeter';
import { Button } from '@/components/ui/button';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatMoneyRound } from '@/utils/format';
import { type ProviderSyncState, SYNC_STATE_GLYPH, countSyncStates } from '@/utils/providerState';
import { NAV, isNavActive } from './nav';

// Sentence-case group heading in soft gray; spelled out because SidebarGroupLabel brings its own
// type classes.
const GROUP_LABEL = 'h-7 px-2 text-[13px] font-normal text-ink-2';

// Soft rounded rows with a thin gray icon. The active one sits on the accent fill in slate, icon
// included. Keyboard focus shows as the hover fill rather than a ring around the whole row.
const ROW =
  'h-8 gap-2.5 rounded-lg px-2.5 text-sm text-foreground hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:text-foreground focus-visible:ring-0 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-slate';

export function NavGroups() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();

  return (
    <>
      {NAV.map((group) => (
        <SidebarGroup key={group.sectionKey} className="px-0 py-1.5">
          <SidebarGroupLabel className={GROUP_LABEL}>{t(group.sectionKey)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {group.items.map((it) => (
                <SidebarMenuItem key={it.to}>
                  <SidebarMenuButton asChild isActive={isNavActive(it, pathname)} className={ROW}>
                    <RouterNavLink to={it.to} end={it.end} onClick={() => setOpenMobile(false)}>
                      <it.icon
                        aria-hidden
                        stroke={1.5}
                        className="size-4 shrink-0 text-ink-3 in-data-[active=true]:text-slate"
                      />
                      <span>{t(it.labelKey)}</span>
                    </RouterNavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

// Order of the sync rows; manual accounts never sync, so they have no row here.
const SYNC_ROWS: Exclude<ProviderSyncState, 'manual'>[] = [
  'ok',
  'syncing',
  'failed',
  'never',
  'off',
];

/** Accounts counted by sync state, with the same status dots the providers table uses. */
export function SyncStatusGroup() {
  const { t } = useTranslation();
  const { data: providers } = useProviders();
  const activity = useSyncActivity();
  const { setOpenMobile } = useSidebar();

  const counts = countSyncStates(providers, activity);
  const rows = SYNC_ROWS.filter((s) => s === 'ok' || counts[s] > 0);
  // Hidden while nothing can sync: no providers yet, or every account is manual.
  if (SYNC_ROWS.every((s) => counts[s] === 0)) return null;

  return (
    <SidebarGroup className="px-0 py-1.5">
      <SidebarGroupLabel className={GROUP_LABEL}>{t('shell.syncGroup')}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {rows.map((state) => (
            <SidebarMenuItem key={state}>
              <SidebarMenuButton
                asChild
                className={cn(
                  ROW,
                  state === 'failed' && 'hover:bg-fail-bg focus-visible:bg-fail-bg',
                )}
              >
                <Link
                  to={state === 'syncing' ? '/providers' : `/providers?state=${state}`}
                  onClick={() => setOpenMobile(false)}
                >
                  <InkGlyph state={SYNC_STATE_GLYPH[state]} className="ml-0.5" />
                  <span
                    className={cn('flex-1', state === 'failed' ? 'text-destructive' : 'text-ink-2')}
                  >
                    {t(`syncState.${state}`)}
                  </span>
                  <span
                    className={cn(
                      'text-xs',
                      state === 'failed' ? 'text-destructive/70' : 'text-ink-3',
                    )}
                  >
                    {counts[state]}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Payments logged this calendar month against the monthly run-rate of active services. */
export function PaidMeter() {
  const { t } = useTranslation();
  const { data } = useSummary();
  if (!data) return null;
  const paid = Number(data.currentMonthPayments);
  const total = Number(data.monthlyTotal);
  const base = data.baseCurrency;
  const ratio = total > 0 ? paid / total : null;
  const detail =
    total > 0
      ? `${formatMoneyRound(paid)} / ${formatMoneyRound(total, base)}`
      : formatMoneyRound(paid, base);
  // Top-ups are prepayments, so a month can pass 100%: the bar caps, the percentage tells.
  return (
    <InkMeter
      label={t('shell.paidThisMonth')}
      value={ratio == null ? '—' : `${Math.round(ratio * 100)}%`}
      detail={detail}
      ratio={ratio}
    />
  );
}

export function UserBlock() {
  const { t } = useTranslation();
  const me = useMe();
  const logout = useLogout();
  const name = me.data?.username ?? '—';

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-[11px] font-medium"
        >
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm">{name}</p>
          <p className="truncate text-xs text-ink-2">@{t('app.singleUser')}</p>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('app.logout')}
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <IconLogout stroke={1.5} className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('app.logout')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
