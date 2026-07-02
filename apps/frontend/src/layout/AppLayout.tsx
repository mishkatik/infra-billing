import {
  IconFolders,
  IconKey,
  IconLayoutDashboard,
  IconLogout,
  IconReceipt2,
  IconServer2,
  IconSettings,
  IconShieldLock,
  IconStack2,
  type Icon,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { NavLink as RouterNavLink, Outlet, useLocation } from 'react-router-dom';
import { useLogout, useMe } from '@/api/auth';
import { BrandWordmark } from '@/components/BrandWordmark';
import { BuildInfo } from '@/components/BuildInfo';
import { DocsLink } from '@/components/DocsLink';
import { GithubStars } from '@/components/GithubStars';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  to: string;
  labelKey: string;
  icon: Icon;
  end?: boolean;
}

const NAV: { sectionKey: string; items: NavItem[] }[] = [
  {
    sectionKey: 'nav.overview',
    items: [{ to: '/', labelKey: 'nav.dashboard', icon: IconLayoutDashboard, end: true }],
  },
  {
    sectionKey: 'nav.infrastructure',
    items: [
      { to: '/providers', labelKey: 'nav.providers', icon: IconServer2 },
      { to: '/projects', labelKey: 'nav.projects', icon: IconFolders },
      { to: '/services', labelKey: 'nav.services', icon: IconStack2 },
      { to: '/payments', labelKey: 'nav.payments', icon: IconReceipt2 },
    ],
  },
  {
    sectionKey: 'nav.settings',
    items: [
      { to: '/settings', labelKey: 'nav.settingsItem', icon: IconSettings, end: true },
      { to: '/settings/auth', labelKey: 'nav.authItem', icon: IconShieldLock },
      { to: '/settings/tokens', labelKey: 'nav.tokensItem', icon: IconKey },
    ],
  },
];

function NavGroups() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();

  return (
    <>
      {NAV.map((group) => (
        <SidebarGroup key={group.sectionKey}>
          <SidebarGroupLabel className="section-label">{t(group.sectionKey)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((it) => {
                const active = it.end ? pathname === it.to : pathname.startsWith(it.to);
                const ItemIcon = it.icon;
                return (
                  <SidebarMenuItem key={it.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="h-10 gap-2.5 px-3 text-[15px] data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold"
                    >
                      <RouterNavLink to={it.to} end={it.end} onClick={() => setOpenMobile(false)}>
                        <ItemIcon className="size-5" stroke={1.5} />
                        <span>{t(it.labelKey)}</span>
                      </RouterNavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function UserBlock() {
  const { t } = useTranslation();
  const me = useMe();
  const logout = useLogout();

  return (
    <div className="flex items-center justify-between gap-2 p-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="size-9">
          <AvatarFallback className="bg-brand/15 font-bold text-brand">
            {(me.data?.username ?? 'A').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{me.data?.username ?? '—'}</p>
          <p className="truncate text-xs text-muted-foreground">{t('app.singleUser')}</p>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('app.logout')}
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <IconLogout className="size-[18px]" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('app.logout')}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <div className="flex items-center px-2 pt-2 pb-0.5">
            <BrandWordmark className="text-[17px]" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavGroups />
        </SidebarContent>
        <SidebarFooter>
          <UserBlock />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1.5 border-b bg-background/85 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          <div className="hidden sm:block">
            <GithubStars />
          </div>
          <DocsLink />
          <ThemeToggle />
          <LanguageSwitcher />
          <div className="hidden sm:block">
            <BuildInfo />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
