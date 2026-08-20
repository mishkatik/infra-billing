import { IconCheck, IconChevronDown, IconMoodSmile, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_ICON_BG,
  ICON_BG_SWATCHES,
  TABLER_ICON_CATALOG,
  canonicalTablerIconName,
  resolveTablerIconEntry,
} from '@/components/tablerIconCatalog';
import { Button } from '@/components/ui/button';
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

interface ServiceMarkerFieldProps {
  id?: string;
  marker: string;
  markerBg: string;
  onMarkerChange: (value: string) => void;
  onMarkerBgChange: (value: string) => void;
}

function isEmojiMarker(marker: string): boolean {
  if (!marker) return false;
  return !canonicalTablerIconName(marker) && !resolveTablerIconEntry(marker);
}

function emojiFromSearch(search: string): string | null {
  const next = search.trim();
  if (!next || canonicalTablerIconName(next) || resolveTablerIconEntry(next)) return null;
  if (/^[\p{L}\p{N} _./-]+$/u.test(next)) return null;
  return next.slice(0, 8);
}

export function ServiceMarkerPreview({
  marker,
  markerBg,
  size = 18,
}: {
  marker: string;
  markerBg?: string | null;
  size?: number;
}) {
  const entry = resolveTablerIconEntry(marker);
  if (entry) {
    const Icon = entry.Icon;
    const color = markerBg || DEFAULT_ICON_BG;
    const glyph = Math.max(12, Math.round(size * 0.9));
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center self-center"
        style={{ width: size, height: size }}
      >
        <Icon size={glyph} stroke={1.75} color={color} className="block" aria-hidden />
      </span>
    );
  }
  if (marker) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center self-center leading-none"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.85) }}
      >
        {marker}
      </span>
    );
  }
  return null;
}

export function ServiceMarkerField({
  id,
  marker,
  markerBg,
  onMarkerChange,
  onMarkerBgChange,
}: ServiceMarkerFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = resolveTablerIconEntry(marker);
  const color = markerBg || DEFAULT_ICON_BG;
  const emojiMode = isEmojiMarker(marker);
  const searchEmoji = emojiFromSearch(search);

  const pickIcon = (name: string) => {
    const canonical = canonicalTablerIconName(name) ?? name;
    onMarkerChange(canonical);
    if (!markerBg) onMarkerBgChange(DEFAULT_ICON_BG);
    setOpen(false);
    setSearch('');
  };

  const pickEmoji = (value: string) => {
    onMarkerChange(value);
    onMarkerBgChange('');
    setOpen(false);
    setSearch('');
  };

  const clear = () => {
    onMarkerChange('');
    onMarkerBgChange('');
    setColorOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-input">
        {marker ? (
          <ServiceMarkerPreview marker={marker} markerBg={markerBg} size={20} />
        ) : (
          <IconMoodSmile className="size-4 text-muted-foreground opacity-50" />
        )}
      </span>

      {selected ? (
        <Popover open={colorOpen} onOpenChange={setColorOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('common.iconBg')}
              className="size-9 shrink-0 rounded-md border border-input shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{ backgroundColor: color }}
            />
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="grid grid-cols-6 gap-1.5">
              {ICON_BG_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={swatch}
                  className={cn(
                    'aspect-square w-full rounded-sm border border-black/10 shadow-xs',
                    color.toLowerCase() === swatch.toLowerCase() && 'ring-2 ring-inset ring-ring',
                  )}
                  style={{ backgroundColor: swatch }}
                  onClick={() => {
                    onMarkerBgChange(swatch);
                    setColorOpen(false);
                  }}
                />
              ))}
              <label className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-sm border border-input shadow-xs">
                <span className="sr-only">{t('common.iconBgCustom')}</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onMarkerBgChange(e.target.value.toUpperCase())}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                <span
                  className="block size-full"
                  style={{
                    background:
                      'conic-gradient(#f43f5e, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #f43f5e)',
                  }}
                />
              </label>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch('');
        }}

        modal
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <span className={cn('truncate', !selected && !emojiMode && 'text-muted-foreground')}>
              {selected ? selected.label : emojiMode ? marker : t('services.markerPlaceholder')}
            </span>
            <IconChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('services.markerSearchPlaceholder')}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{t('common.nothingFound')}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="-"
                  className="text-muted-foreground"
                  onSelect={() => {
                    clear();
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  {t('services.markerClear')}
                </CommandItem>
                {searchEmoji ? (
                  <CommandItem
                    value={`emoji:${searchEmoji}`}
                    onSelect={() => pickEmoji(searchEmoji)}
                  >
                    <span className="text-base leading-none">{searchEmoji}</span>
                    <span className="truncate">{t('services.markerUseEmoji')}</span>
                  </CommandItem>
                ) : null}
                {TABLER_ICON_CATALOG.map(({ name, label, Icon, keywords }) => (
                  <CommandItem
                    key={name}
                    value={name}
                    keywords={[label, ...keywords]}
                    onSelect={(value) => pickIcon(value)}
                  >
                    <Icon size={16} stroke={1.75} color={color} aria-hidden />
                    <span className="truncate">{label}</span>
                    {name === selected?.name && <IconCheck className="ml-auto size-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {marker ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={clear}
        >
          <IconX className="size-4" />
          <span className="sr-only">{t('services.markerClear')}</span>
        </Button>
      ) : null}
    </div>
  );
}
