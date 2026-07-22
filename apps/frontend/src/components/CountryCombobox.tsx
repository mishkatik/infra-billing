import { IconCheck, IconChevronDown, IconMapPin } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface CountryComboboxProps {
  /** ISO2 code, or '' when unset. */
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Shown in the trigger when unset and as the "clear" item label. */
  placeholder: string;
  id?: string;
}

/** Searchable country picker (Popover + Command). The trigger mimics SelectTrigger styling. */
export function CountryCombobox({
  value,
  onChange,
  options,
  placeholder,
  id,
}: CountryComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconMapPin className="size-4 shrink-0 text-muted-foreground opacity-60" />
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          <IconChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={t('common.searchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{t('common.nothingFound')}</CommandEmpty>
            <CommandGroup>
              {/* value="-" never matches a real search, so the clear item hides while typing. */}
              <CommandItem value="-" className="text-muted-foreground" onSelect={() => pick('')}>
                {placeholder}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  keywords={[o.value]}
                  onSelect={() => pick(o.value)}
                >
                  {o.label}
                  {o.value === value && <IconCheck className="ml-auto size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
