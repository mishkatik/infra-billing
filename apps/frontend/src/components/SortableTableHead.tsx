import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { TableHead } from '@/components/ui/table';
import type { SortDir } from '@/hooks/useTableSort';
import { cn } from '@/lib/utils';

interface SortableTableHeadProps {
  /** Already-translated column label — it is also the button's accessible name. */
  label: string;
  /** This column's direction, or null when it is not the active sort key. */
  active: SortDir | null;
  onToggle: () => void;
  className?: string;
}

export function SortableTableHead({ label, active, onToggle, className }: SortableTableHeadProps) {
  return (
    <TableHead
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}
      className={className}
    >
      {/* -ml-2/px-2 keeps the label at the th's 12px content edge (like plain headers)
          while the button edge stays 4px in, so the focus ring isn't clipped by the
          overflow-x-auto wrapper. The type matches the plain header row; the active column
          steps up to the main text colour. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className={cn(
          '-ml-2 h-7 gap-1 px-2 text-[13px] font-normal has-[>svg]:px-2',
          active ? 'text-foreground' : 'text-ink-2 hover:text-foreground',
        )}
      >
        {label}
        {active === 'asc' ? (
          <IconArrowUp className="size-3 text-ink-3" />
        ) : active === 'desc' ? (
          <IconArrowDown className="size-3 text-ink-3" />
        ) : (
          <IconArrowsSort className="size-3 text-ink-3 opacity-60" />
        )}
      </Button>
    </TableHead>
  );
}
