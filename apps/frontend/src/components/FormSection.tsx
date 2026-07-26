import type { Icon } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';
import { iconFgForBg } from '@/components/tablerIconCatalog';
import { cn } from '@/lib/utils';

interface FormSectionProps {
  icon: Icon;
  title: string;
  children: ReactNode;
  /** When set, paints the icon tile with this background instead of the accent chip. */
  iconBg?: string | null;
}

/** Bordered form section with an icon tile + uppercase label, echoing the info panels. */
export function FormSection({ icon: IconCmp, title, children, iconBg }: FormSectionProps) {
  const custom = Boolean(iconBg);
  const style: CSSProperties | undefined = custom
    ? { backgroundColor: iconBg!, color: iconFgForBg(iconBg!) }
    : undefined;
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            !custom && 'bg-accent text-accent-foreground',
            custom && 'border border-black/10',
          )}
          style={style}
        >
          <IconCmp className="size-4" stroke={1.75} />
        </div>
        <p className="section-label">{title}</p>
      </div>
      {children}
    </section>
  );
}
