import type { Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

interface FormSectionProps {
  icon: Icon;
  title: string;
  children: ReactNode;
}

/** Bordered form section with an icon tile + uppercase label, echoing the info panels. */
export function FormSection({ icon: IconCmp, title, children }: FormSectionProps) {
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <IconCmp className="size-4" />
        </div>
        <p className="section-label">{title}</p>
      </div>
      {children}
    </section>
  );
}
