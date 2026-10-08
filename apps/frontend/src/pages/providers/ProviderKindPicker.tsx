import { IconCheck, IconChevronDown } from '@tabler/icons-react';
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
import { DEFAULT_LOGIN_URLS } from './providerForm';

interface ProviderKindPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  id?: string;
}

// The control panel's host is the quickest way to tell connectors apart (billmgr vs hostbill,
// aeza vs vdsina…); self-hosted panels (BILLmanager, HostBill) have none.
const hostOf = (kind: string) => {
  const url = DEFAULT_LOGIN_URLS[kind];
  return url ? new URL(url).host.replace(/^www\./, '') : '';
};

/**
 * Searchable connector picker: "manual" first, then the API connectors alphabetically, in a
 * short scrolling list instead of a full-height select.
 */
export function ProviderKindPicker({
  value,
  onChange,
  options,
  disabled,
  id,
}: ProviderKindPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const manual = options.filter((o) => o.value === 'manual');
  const api = options
    .filter((o) => o.value !== 'manual')
    .sort((a, b) => a.label.localeCompare(b.label));

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const item = (o: { value: string; label: string }) => (
    <CommandItem
      key={o.value}
      value={`${o.label} ${hostOf(o.value)}`}
      onSelect={() => pick(o.value)}
    >
      <span className="font-mono">{o.label}</span>
      <span className="ml-auto truncate pl-3 text-xs text-ink-3">{hostOf(o.value)}</span>
      <IconCheck
        className={cn('size-4 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')}
      />
    </CommandItem>
  );

  return (
    // modal: without it the parent dialog's scroll lock swallows wheel events over the list.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-transparent bg-field px-3 py-2 text-sm outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring/40 focus-visible:ring-3 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-mono">{selected?.label ?? value}</span>
            {hostOf(value) && <span className="truncate text-xs text-ink-3">{hostOf(value)}</span>}
          </span>
          <IconChevronDown className="size-4 shrink-0 text-ink-3" stroke={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={t('common.searchPlaceholder')} />
          <CommandList className="max-h-72">
            <CommandEmpty>{t('common.nothingFound')}</CommandEmpty>
            <CommandGroup heading={t('providers.kindPicker.noApi')}>
              {manual.map(item)}
            </CommandGroup>
            <CommandGroup heading={t('providers.kindPicker.api')}>{api.map(item)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
