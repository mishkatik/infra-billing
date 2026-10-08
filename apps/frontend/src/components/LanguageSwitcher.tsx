import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Each language is named in its own tongue, so these stay untranslated.
const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
];

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const active = LANGS.find((l) => l.code === current) ?? LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          // The visible code stays part of the name (label-in-name).
          aria-label={`${active.code.toUpperCase()} · ${t('lang.label')}`}
          className="text-xs font-normal"
        >
          {active.code.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-40"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => void i18n.changeLanguage(l.code)}>
            <span className="w-5 text-xs text-ink-3">{l.code.toUpperCase()}</span>
            <span className="flex-1">{l.label}</span>
            {current === l.code ? <IconCheck className="size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
