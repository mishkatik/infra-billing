import { IconCheck, IconChevronDown, IconColorPicker, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/ProviderIcon';
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
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface IconAppearanceFieldsProps {
  previewName: string;
  iconName: string;
  iconBg: string;
  onIconNameChange: (value: string) => void;
  onIconBgChange: (value: string) => void;
}

export function IconAppearanceFields({
  previewName,
  iconName,
  iconBg,
  onIconNameChange,
  onIconBgChange,
}: IconAppearanceFieldsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = resolveTablerIconEntry(iconName);
  const bg = iconBg || DEFAULT_ICON_BG;
  const storedName = canonicalTablerIconName(iconName) ?? '';

  const pickIcon = (name: string) => {
    const canonical = canonicalTablerIconName(name) ?? name;
    onIconNameChange(canonical);
    if (!iconBg) onIconBgChange(DEFAULT_ICON_BG);
    setOpen(false);
  };

  const clear = () => {
    onIconNameChange('');
    onIconBgChange('');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>{t('common.iconAppearance')}</Label>
        <p className="text-xs text-ink-3">{t('common.iconAppearanceHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ProviderIcon
          name={previewName || '?'}
          src={null}
          iconName={storedName || null}
          iconBg={storedName ? bg : null}
          size={32}
        />

        {/* modal: without it a parent dialog's scroll lock swallows wheel events over the list. */}
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              className="flex h-9 min-w-40 flex-1 items-center justify-between gap-2 rounded-md border border-transparent bg-field px-3 py-2 text-sm transition-[color,box-shadow,border-color] outline-none focus-visible:border-ring/40 focus-visible:ring-3 focus-visible:ring-ring/15"
            >
              <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                {selected ? selected.label : t('common.iconPick')}
              </span>
              <IconChevronDown className="size-4 shrink-0 text-ink-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder={t('common.searchPlaceholder')} />
              <CommandList>
                <CommandEmpty>{t('common.nothingFound')}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="-"
                    className="text-ink-2"
                    onSelect={() => {
                      clear();
                      setOpen(false);
                    }}
                  >
                    {t('common.iconUseFavicon')}
                  </CommandItem>
                  {TABLER_ICON_CATALOG.map(({ name, label, Icon, keywords }) => (
                    <CommandItem
                      key={name}
                      value={name}
                      keywords={[label, ...keywords]}
                      onSelect={(value) => pickIcon(value)}
                    >
                      <Icon className="size-4 text-ink-2" stroke={1.5} />
                      <span className="truncate">{label}</span>
                      {name === storedName && <IconCheck className="ml-auto size-4 text-ink-2" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {storedName ? (
          <Button type="button" variant="ghost" size="icon" className="size-9" onClick={clear}>
            <IconX className="size-4" />
            <span className="sr-only">{t('common.iconClear')}</span>
          </Button>
        ) : null}
      </div>

      {storedName ? (
        <div className="space-y-2">
          <Label>{t('common.iconBg')}</Label>
          {/* Swatches render in grayscale like every icon: the stored colour still reads as a
              distinct gray tone. */}
          <div className="flex flex-wrap items-center gap-2">
            {ICON_BG_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                className={cn(
                  'size-7 rounded-md ring-1 ring-foreground/10 ring-inset grayscale transition-[outline]',
                  bg.toLowerCase() === swatch.toLowerCase() &&
                    'outline-2 outline-offset-2 outline-foreground',
                )}
                style={{ backgroundColor: swatch }}
                onClick={() => onIconBgChange(swatch)}
              />
            ))}
            <label className="relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-md bg-field text-ink-3 transition-colors hover:text-foreground">
              <span className="sr-only">{t('common.iconBgCustom')}</span>
              <input
                type="color"
                value={bg}
                onChange={(e) => onIconBgChange(e.target.value.toUpperCase())}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <IconColorPicker className="pointer-events-none size-4" stroke={1.5} />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
