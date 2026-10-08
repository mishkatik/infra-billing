import type { Service } from '@infra/shared';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { JsonView } from '@/components/JsonView';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Raw provider `meta` JSON for a synced service, with a copy-to-clipboard button.
export function ServiceMetaModal({
  service,
  onClose,
}: {
  service: Service | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The parent nulls `service` right on close while Radix is still playing the exit animation —
  // without this "memory" the content visibly collapses to an empty shell. Show the last service.
  const lastService = useRef<Service | null>(service);
  if (service) lastService.current = service;
  const shown = service ?? lastService.current;

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(shown?.meta, null, 2));
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={!!service} onOpenChange={(o) => !o && onClose()}>
      {/* No autofocus: otherwise the focus ring lights up on the copy button right away. */}
      <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('services.metaTitle', { name: shown?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        {shown && Object.keys(shown.meta ?? {}).length > 0 ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copied ? t('common.copied') : t('common.copy')}
                    onClick={copy}
                  >
                    {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? t('common.copied') : t('common.copy')}</TooltipContent>
              </Tooltip>
            </div>
            <JsonView data={shown.meta} />
          </div>
        ) : (
          <p className="py-4 text-center text-ink-2">{t('services.metaEmpty')}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
