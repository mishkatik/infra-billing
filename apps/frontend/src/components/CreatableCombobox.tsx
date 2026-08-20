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
  /** Fired when the user creates a value that was not in `options`. */
  onCreate?: (value: string) => void;
}

/** Searchable select that can create a new option from the query (GitLab label style). */
export function CreatableCombobox({
  value,
  onChange,
  options,
  placeholder,
  id,
  normalizeCreate = (raw) => raw.trim(),
  onCreate,
}: CreatableComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    if (!value.trim()) return options;
    if (options.some((o) => o.value === value)) return options;
    return [...options, { value, label: value }];
  }, [options, value]);
  const optionsKey = useMemo(() => list.map((o) => o.value).join('\0'), [list]);
  const selected = list.find((o) => o.value === value);
  const display = selected?.label ?? (value || placeholder || '');

  const canCreate = useMemo(() => {
    const next = normalizeCreate(query);
    if (!next) return false;
    const lower = next.toLowerCase();
    return !list.some((o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower);
  }, [normalizeCreate, list, query]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const create = () => {
    const next = normalizeCreate(query);
    if (!next) return;
    onCreate?.(next);
    pick(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
      // Without modal a parent dialog's scroll lock swallows wheel events over the list.
      modal
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
        <Command key={optionsKey} shouldFilter>
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
              {list.map((o) => (
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
