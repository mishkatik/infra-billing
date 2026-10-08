import { IconChevronDown, type Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';

// A sign-in method row. Rows with config (passkey) get an expand chevron + collapsible body;
// plain on/off rows (password) are just the switch.
export function MethodRow({
  icon: RowIcon,
  title,
  description,
  enabled,
  onToggle,
  opened,
  onToggleOpen,
  children,
}: {
  icon: Icon;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  opened?: boolean;
  onToggleOpen?: () => void;
  children?: ReactNode;
}) {
  const expandable = onToggleOpen !== undefined;
  const label = (
    <div className="flex items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-ink-2">
        <RowIcon className="size-4.5" stroke={1.5} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[13px] text-ink-2">{description}</p>
      </div>
    </div>
  );

  if (!expandable) {
    return (
      <div className="flex items-center justify-between gap-3 py-4">
        <div className="min-w-0 flex-1">{label}</div>
        <Switch checked={enabled} onCheckedChange={onToggle} aria-label={title} />
      </div>
    );
  }

  return (
    <Collapsible open={!!opened} onOpenChange={() => onToggleOpen()}>
      <div className="flex items-center justify-between gap-3 py-4">
        {/* When expandable, the whole label toggles the section; only the switch is exempt. */}
        <CollapsibleTrigger asChild>
          <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={opened}>
            {label}
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={title} className="group/expand">
              <IconChevronDown
                stroke={1.5}
                className="size-4 transition-transform group-data-[state=open]/expand:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <Switch checked={enabled} onCheckedChange={onToggle} aria-label={title} />
        </div>
      </div>
      <CollapsibleContent>
        <div className="pb-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
