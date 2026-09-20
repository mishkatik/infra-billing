import { IconFilterOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/**
 * Ghost "Reset" for list pages: clears whatever the page remembers across visits (filters,
 * column sort). Callers render it only while something is active, so it doubles as the cue that
 * the view is not the default one.
 */
export function ResetViewButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" onClick={onClick}>
      <IconFilterOff className="size-4" />
      {t('common.resetView')}
    </Button>
  );
}
