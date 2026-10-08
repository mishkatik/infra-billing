import { createContext, type ReactNode, use, useMemo, useState } from 'react';

/**
 * The header bar owns three slots that the current page fills through PageHeader (portals):
 * the breadcrumb title, centre controls (a segmented filter) and the right-side actions.
 */
export interface PageChromeSlots {
  title: HTMLElement | null;
  controls: HTMLElement | null;
  actions: HTMLElement | null;
}

interface PageChromeValue extends PageChromeSlots {
  setTitle: (el: HTMLElement | null) => void;
  setControls: (el: HTMLElement | null) => void;
  setActions: (el: HTMLElement | null) => void;
}

const PageChromeContext = createContext<PageChromeValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const [controls, setControls] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ title, controls, actions, setTitle, setControls, setActions }),
    [title, controls, actions],
  );
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

export function usePageChrome(): PageChromeValue {
  const ctx = use(PageChromeContext);
  if (!ctx) throw new Error('usePageChrome must be used inside PageChromeProvider');
  return ctx;
}
