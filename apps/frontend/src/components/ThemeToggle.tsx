import { IconMoon, IconSun } from '@tabler/icons-react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/lib/theme';

/** Light/dark theme toggle; the choice survives reloads (localStorage). */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { resolved, setScheme } = useTheme();
  const isDark = resolved === 'dark';
  const label = isDark ? t('theme.light') : t('theme.dark');

  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    // Cross-fade via the View Transitions API; flushSync applies the scheme synchronously
    // inside the transition so the new colors land in the snapshot. No support → instant switch.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => flushSync(() => setScheme(next)));
    } else {
      setScheme(next);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={toggle}>
          {isDark ? (
            <IconSun stroke={1.5} className="size-4" />
          ) : (
            <IconMoon stroke={1.5} className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
