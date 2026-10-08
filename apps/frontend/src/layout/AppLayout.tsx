import { IconSearch } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { BrandWordmark } from '@/components/BrandWordmark';
import { BuildInfo } from '@/components/BuildInfo';
import { CommandPalette } from '@/components/CommandPalette';
import { DocsLink } from '@/components/DocsLink';
import { GithubStars } from '@/components/GithubStars';
import { Kbd } from '@/components/ink/Kbd';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { RwpPromo } from '@/components/RwpPromo';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { PageChromeProvider, usePageChrome } from './pageChrome';
import { NavGroups, PaidMeter, SyncStatusGroup, UserBlock } from './SidebarParts';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

function SearchField({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();
  return (
    <button
      type="button"
      onClick={() => {
        setOpenMobile(false);
        onOpen();
      }}
      className="flex h-8 w-full items-center gap-2 rounded-md bg-background px-2.5 text-left text-[13px] text-ink-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <IconSearch aria-hidden stroke={1.5} className="size-4 shrink-0 text-ink-3" />
      <span className="flex-1 truncate">{t('shell.search')}</span>
      <Kbd>{IS_MAC ? '⌘F' : 'Ctrl F'}</Kbd>
    </button>
  );
}

/**
 * The 64px header bar: breadcrumb on the left, the page's controls in the middle and its actions
 * on the right. Pages fill the three slots through PageHeader; on narrow screens the controls drop
 * to a second row. On wide screens it is a three-column grid, so the controls hold still when an
 * action (e.g. Reset) appears or disappears next to them.
 */
function HeaderBar() {
  const { t } = useTranslation();
  const { setTitle, setControls, setActions } = usePageChrome();
  return (
    <header className="sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 bg-background px-4 py-3 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1 size-8 md:hidden" />
        <nav aria-label={t('shell.breadcrumb')} className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-ink-2 sm:inline">{t('app.crumbRoot')}</span>
          <span aria-hidden className="hidden text-ink-3 sm:inline">
            /
          </span>
          <span ref={setTitle} className="flex min-w-0" />
        </nav>
      </div>
      <div
        ref={setControls}
        className="order-last flex basis-full items-center overflow-x-auto empty:hidden lg:order-none lg:col-start-2 lg:basis-auto"
      />
      <div
        ref={setActions}
        className="flex shrink-0 items-center gap-1.5 empty:hidden lg:col-start-3 lg:justify-self-end"
      />
    </header>
  );
}

export function AppLayout() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    // Cmd/Ctrl+F opens the palette instead of the browser's find bar (the panel's search is the
    // palette); Cmd/Ctrl+K stays as the usual command-palette shortcut. event.code keeps it working
    // on non-Latin layouts (Ctrl+А on a Russian keyboard is still KeyF).
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.code === 'KeyF' || e.code === 'KeyK') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SidebarProvider>
      <PageChromeProvider>
        {/* The white sidebar sits on the stone canvas by tone alone, so no dividing line. */}
        <Sidebar collapsible="offcanvas" className="group-data-[side=left]:border-r-0">
          <SidebarHeader className="gap-4 px-5 pt-5 pb-3">
            <div className="flex items-center justify-between gap-2">
              <BrandWordmark />
              <BuildInfo />
            </div>
            <SearchField onOpen={() => setPaletteOpen(true)} />
          </SidebarHeader>
          <SidebarContent className="gap-1 px-3">
            <NavGroups />
            <SyncStatusGroup />
          </SidebarContent>
          <SidebarFooter className="gap-3 px-4 pt-3 pb-4">
            <PaidMeter />
            <RwpPromo />
            <div className="flex items-center gap-1 border-t border-hairline pt-4">
              <GithubStars />
              <div className="flex-1" />
              <DocsLink />
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <UserBlock />
          </SidebarFooter>
        </Sidebar>

        {/* min-w-0: a wide table must scroll inside its card, not stretch the whole column. */}
        <SidebarInset className="min-w-0">
          <HeaderBar />
          <div className="flex-1 px-4 pt-2 pb-8 sm:px-8">
            <Outlet />
          </div>
        </SidebarInset>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </PageChromeProvider>
    </SidebarProvider>
  );
}
