import { IconCheck, IconChevronDown, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
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

interface CreatableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  id?: string;
  /** Normalize a newly created value before commit (default: trim). */
  normalizeCreate?: (raw: string) => string;
}

/** Searchable select that can create a new option from the query (GitLab label style). */
export function CreatableCombobox({
  value,
  onChange,
  options,
  placeholder,
  id,
  normalizeCreate = (raw) => raw.trim(),
}: CreatableComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? (value || placeholder || '');

  const canCreate = useMemo(() => {
    const next = normalizeCreate(query);
    if (!next) return false;
    const lower = next.toLowerCase();
    return !options.some((o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower);
  }, [normalizeCreate, options, query]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const create = () => {
    const next = normalizeCreate(query);
    if (!next) return;
    pick(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{display}</span>
          <IconChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder={t('common.searchPlaceholder')}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {canCreate ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm"
                  onClick={create}
                >
                  <IconPlus className="size-4 shrink-0" />
                  {t('common.createOption', { name: normalizeCreate(query) })}
                </button>
              ) : (
                t('common.nothingFound')
              )}
            </CommandEmpty>
            <CommandGroup>
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
              {canCreate && (
                <CommandItem value={`__create__${query}`} onSelect={create}>
                  <IconPlus className="size-4 shrink-0" />
                  {t('common.createOption', { name: normalizeCreate(query) })}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
