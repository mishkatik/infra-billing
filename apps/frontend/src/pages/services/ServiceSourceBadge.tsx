import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

/** Where a service comes from: synced by a connector or kept by hand. */
export function ServiceSourceBadge({ managed }: { managed: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant="secondary">
      {managed ? t('services.sourceManaged') : t('services.sourceManual')}
    </Badge>
  );
}
