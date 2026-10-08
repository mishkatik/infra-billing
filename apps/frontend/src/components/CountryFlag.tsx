import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { countryName } from '@/utils/countries';

/** ISO 3166-1 alpha-2 code → regional-indicator flag emoji; unknown or 'XX' → white flag. */
export function countryFlag(code: string | null | undefined): string {
  if (code?.length !== 2 || code === 'XX') return '🏳️';
  const base = 0x1f1e6;
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => base + (c.charCodeAt(0) - 65)));
}

/**
 * A country as its flag emoji, in colour, with the localized name as the tooltip. Flags are the
 * one deliberate exception to the grayscale imagery: in gray they turn into indistinguishable
 * stripes. (On Windows the emoji come from the flag polyfill font, see main.tsx.)
 */
export function CountryFlag({
  code,
  className,
}: {
  code: string | null | undefined;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const known = code?.length === 2 && code !== 'XX';
  return (
    <span
      title={known ? countryName(code, i18n.resolvedLanguage ?? 'en') : undefined}
      className={cn(
        'inline-flex size-[18px] shrink-0 items-center justify-center text-[15px] leading-none',
        className,
      )}
    >
      {countryFlag(code)}
    </span>
  );
}
