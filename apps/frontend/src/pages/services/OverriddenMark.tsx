import { IconPencil } from '@tabler/icons-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function OverriddenMark({
  label,
  onRestore,
}: {
  label: string;
  onRestore: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <IconPencil className="size-3.5" stroke={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
