import type { Icon } from '@tabler/icons-react';
import type { CSSProperties, ReactNode } from 'react';
import { iconFgForBg } from '@/components/tablerIconCatalog';
import { cn } from '@/lib/utils';

interface FormSectionProps {
  icon: Icon;
  title: string;
  children: ReactNode;
  /** When set, paints the icon tile with this background (in grayscale) instead of the soft fill. */
  iconBg?: string | null;
}

/**
 * Form section: a small icon tile and a title over the fields. No frame of its own — sections
 * sit on the dialog or card surface, and a following section gets a hairline above it.
 */
export function FormSection({ icon: IconCmp, title, children, iconBg }: FormSectionProps) {
  const custom = Boolean(iconBg);
  const style: CSSProperties | undefined = custom
    ? { backgroundColor: iconBg!, color: iconFgForBg(iconBg!) }
    : undefined;
  return (
    <section
      data-slot="form-section"
      className="space-y-4 [[data-slot=form-section]+&]:border-t [[data-slot=form-section]+&]:border-hairline [[data-slot=form-section]+&]:pt-6"
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            !custom && 'bg-background text-ink-2',
            custom && 'ring-1 ring-foreground/10 ring-inset grayscale',
          )}
          style={style}
        >
          <IconCmp className="size-4" stroke={1.5} />
        </div>
        <p className="text-[15px] font-medium">{title}</p>
      </div>
      {children}
    </section>
  );
}
