import type { Provider, Service } from '@infra/shared';
import {
  IconBan,
  IconBraces,
  IconLoader2,
  IconPlayerPlay,
  IconReceipt2,
  IconTrash,
} from '@tabler/icons-react';
import { type FormEventHandler, useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '@/components/CountryFlag';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate } from '@/utils/format';
import type { SForm } from './serviceForm';
import { ServiceFormFields } from './ServiceFormFields';
import { ServiceMetaModal } from './ServiceMetaModal';
import { ServicePaymentsModal } from './ServicePaymentsModal';
import { ServiceSourceBadge } from './ServiceSourceBadge';
import {
  LOCATED_TYPES,
  ServiceTypeIcon,
  serviceTypeMarker,
  serviceTypeMarkerBg,
  serviceTypeModel,
} from './ServiceTypeIcon';

interface ServiceDetailModalProps {
  service: Service | null;
  form: UseFormReturn<SForm>;
  providers: Provider[] | undefined;
  projectOptions: { value: string; label: string }[];
  typeOptions: { value: string; label: string }[];
  periodOptions: { value: string; label: string }[];
  currencyOptions: { value: string; label: string }[];
  countryOptions: { value: string; label: string }[];
  isSaving: boolean;
  isToggling: boolean;
  onTypeCreated?: (type: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onToggleActive: (s: Service) => void;
  onDelete: (s: Service) => void;
  onClose: () => void;
}

// Detail view of a single service: editable form on the left, read-only info panel on the right.
export function ServiceDetailModal({
  service,
  form,
  providers,
  projectOptions,
  typeOptions,
  periodOptions,
  currencyOptions,
  countryOptions,
  isSaving,
  isToggling,
  onTypeCreated,
  onSubmit,
  onToggleActive,
  onDelete,
  onClose,
}: ServiceDetailModalProps) {
  const { t } = useTranslation();
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  // The parent nulls `service` right on close while Radix is still playing the exit animation —
  // without this "memory" the content visibly collapses to an empty shell. Show the last service.
  const lastService = useRef<Service | null>(service);
  if (service) lastService.current = service;
  const shown = service ?? lastService.current;

  // Sub-dialogs must not survive a close (e.g. delete from the dropdown while one is queued).
  useEffect(() => {
    if (!service) {
      setPaymentsOpen(false);
      setMetaOpen(false);
    }
  }, [service]);

  const formType = form.watch('type');
  const formVendor = form.watch('vendor');
  const formMarker = form.watch('marker');
  const formMarkerBg = form.watch('markerBg');
  const formCountry = form.watch('countryCode');

  if (shown == null) return null;

  const titleType = formType || shown.type;
  const titleModel =
    titleType === 'llm'
      ? formVendor.trim() || serviceTypeModel(shown.meta)
      : serviceTypeModel(shown.meta);

  const sourceBadge = <ServiceSourceBadge managed={shown.isManaged} />;
  const infoRows: { key: string; label: string; value: string }[] = [
    {
      key: 'payments',
      label: t('services.detail.payments'),
      value: String(shown.paymentsCount ?? 0),
    },
    { key: 'created', label: t('services.detail.created'), value: formatDate(shown.createdAt) },
    { key: 'updated', label: t('services.detail.updated'), value: formatDate(shown.updatedAt) },
  ];

  return (
    <>
      <Dialog open={!!service} onOpenChange={(o) => !o && onClose()}>
        {/* No autofocus: otherwise the first form field lights up right away. */}
        <DialogContent
          className="grid max-h-[85vh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-4xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2">
              {LOCATED_TYPES.has(titleType) ? (
                <CountryFlag code={formCountry || shown.countryCode} />
              ) : (
                <ServiceTypeIcon
                  type={titleType}
                  model={titleModel}
                  marker={formMarker.trim() || serviceTypeMarker(shown.meta)}
                  markerBg={formMarkerBg.trim() || serviceTypeMarkerBg(shown.meta)}
                />
              )}
              <span className="truncate">{shown.name}</span>
              {sourceBadge}
              {!shown.isActive && (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-normal text-ink-2">
                  <InkGlyph state="off" />
                  {t('services.statusInactive')}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-y-auto pr-1 -mr-1">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
              <form id="service-detail-form" onSubmit={onSubmit} className="space-y-4">
                <ServiceFormFields
                  form={form}
                  editing={shown}
                  providers={providers}
                  projectOptions={projectOptions}
                  typeOptions={typeOptions}
                  periodOptions={periodOptions}
                  currencyOptions={currencyOptions}
                  countryOptions={countryOptions}
                  onTypeCreated={onTypeCreated}
                />
              </form>

              <section className="space-y-2.5 self-start rounded-lg bg-background p-4">
                <p className="section-label">{t('services.detail.infoTitle')}</p>
                {shown.externalId && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="shrink-0 text-ink-2">{t('services.detail.externalId')}</span>
                    <span className="truncate font-mono text-xs" title={shown.externalId}>
                      {shown.externalId}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-2">{t('services.detail.source')}</span>
                  {sourceBadge}
                </div>
                {infoRows.map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-2">{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ))}
              </section>
            </div>
          </div>

          <DialogFooter className="flex-row flex-wrap items-center gap-1.5 sm:justify-between">
            <div className="flex flex-1 items-center gap-1.5">
              {(shown.paymentsCount ?? 0) > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('services.paymentsTooltip', {
                        count: shown.paymentsCount ?? 0,
                      })}
                      onClick={() => setPaymentsOpen(true)}
                    >
                      <IconReceipt2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('services.paymentsTooltip', { count: shown.paymentsCount ?? 0 })}
                  </TooltipContent>
                </Tooltip>
              )}
              {Object.keys(shown.meta ?? {}).length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('services.metaTooltip')}
                      onClick={() => setMetaOpen(true)}
                    >
                      <IconBraces className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('services.metaTooltip')}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-fail-bg hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => onDelete(shown)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('common.delete')}</TooltipContent>
              </Tooltip>
              {/* Instant enable/disable — applies immediately, independent of Save. */}
              <Button
                variant="ghost"
                disabled={isToggling}
                className="ml-1"
                onClick={() => onToggleActive(shown)}
              >
                {isToggling ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : shown.isActive ? (
                  <IconBan className="size-4" />
                ) : (
                  <IconPlayerPlay className="size-4" />
                )}
                {shown.isActive ? t('services.detail.disable') : t('services.detail.enable')}
              </Button>
            </div>
            <Button type="submit" form="service-detail-form" disabled={isSaving}>
              {isSaving && <IconLoader2 className="size-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ServicePaymentsModal
        service={paymentsOpen ? shown : null}
        onClose={() => setPaymentsOpen(false)}
      />
      <ServiceMetaModal service={metaOpen ? shown : null} onClose={() => setMetaOpen(false)} />
    </>
  );
}
