import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePageChrome } from '@/layout/pageChrome';

interface PageHeaderProps {
  title: string;
  /** Centre of the header bar: the page's segmented filter, if it has one. */
  controls?: ReactNode;
  /** Right side of the header bar: ghost actions, then at most one solid primary button. */
  actions?: ReactNode;
}

/**
 * Pages declare their header here; it renders into the shell's header bar (breadcrumb title,
 * controls, actions). The visible page has no big title of its own, so an sr-only h1 keeps the
 * heading outline intact.
 */
export function PageHeader({ title, controls, actions }: PageHeaderProps) {
  const slots = usePageChrome();
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {slots.title &&
        createPortal(<span className="truncate text-foreground">{title}</span>, slots.title)}
      {controls != null && slots.controls && createPortal(controls, slots.controls)}
      {actions != null && slots.actions && createPortal(actions, slots.actions)}
    </>
  );
}
