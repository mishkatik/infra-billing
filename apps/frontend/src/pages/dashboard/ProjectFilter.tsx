import { IconChevronDown, IconFolders } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ProjectFilterProps {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export function ProjectFilter({ options, selected, onChange }: ProjectFilterProps) {
  const { t } = useTranslation();
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <IconFolders className="size-4" />
          {t('dashboard.filter.projects')}
          {selected.length > 0 && (
            <Badge variant="secondary" className="px-1.5">
              {selected.length}
            </Badge>
          )}
          <IconChevronDown className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="end">
        <Command>
          <CommandInput placeholder={t('dashboard.filter.search')} />
          <CommandList>
            <CommandEmpty>{t('dashboard.filter.empty')}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                  <Checkbox
                    className="mr-2"
                    checked={selected.includes(o.value)}
                    aria-hidden
                    tabIndex={-1}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {selected.length > 0 && (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
              {t('dashboard.filter.clear')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
