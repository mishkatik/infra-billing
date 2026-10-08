import { IconFileText } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { API_PREFIX } from '@infra/shared';
import { useBuildInfo } from '@/api/buildInfo';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Direct link to the Swagger UI, shown only when the backend has DOCS=true. */
export function DocsLink() {
  const { t } = useTranslation();
  const { data } = useBuildInfo();
  if (!data?.docs) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon-sm" aria-label={t('app.apiDocs')}>
          <a href={`/${API_PREFIX}/docs`} target="_blank" rel="noopener noreferrer">
            <IconFileText stroke={1.5} className="size-4" />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('app.apiDocs')}</TooltipContent>
    </Tooltip>
  );
}
