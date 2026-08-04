import type { Project, Provider, Service } from '@infra/shared';
import { IconCalendarPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { EntityLabel } from '@/components/EntityLabel';
import { SortableTableHead } from '@/components/SortableTableHead';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SortState } from '@/hooks/useTableSort';
import { cn } from '@/lib/utils';
import { projectFavicon, providerFavicon } from '@/utils/favicon';
import { countryFlag, formatCost, formatDateShort, truncate } from '@/utils/format';
import type { ServiceSortKey } from './servicesSort';
import {
  LOCATED_TYPES,
  ServiceTypeIcon,
  serviceTypeMarker,
  serviceTypeMarkerBg,
  serviceTypeModel,
} from './ServiceTypeIcon';

const NAME_MAX_LENGTH = 40;

interface ServicesTableProps {
  services: Service[] | undefined;
  isLoading: boolean;
  providerOf: (uuid: string) => Provider | undefined;
  projectOf: (uuid: string) => Project | undefined;
  serviceTypeLabel: (type: string) => string;
  periodLabel: (period: string) => string;
  sort: SortState<ServiceSortKey> | null;
  onToggleSort: (key: ServiceSortKey) => void;
  onRowClick: (s: Service) => void;
  onBumpNextBilling: (s: Service) => void;
}

export function ServicesTable({
  services,
  isLoading,
  providerOf,
  projectOf,
  serviceTypeLabel,
  periodLabel,
  sort,
  onToggleSort,
  onRowClick,
  onBumpNextBilling,
}: ServicesTableProps) {
  const { t } = useTranslation();
  const sortHead = (key: ServiceSortKey, label: string) => (
    <SortableTableHead
      label={label}
      active={sort?.key === key ? sort.dir : null}
      onToggle={() => onToggleSort(key)}
    />
  );
  return (
    <Card className="overflow-hidden py-0">
      <div className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              {sortHead('name', t('services.colName'))}
              {sortHead('provider', t('services.colProvider'))}
              {sortHead('project', t('services.colProject'))}
              {sortHead('type', t('services.colType'))}
              {sortHead('cost', t('services.colCost'))}
              {sortHead('period', t('services.colPeriod'))}
              {sortHead('nextBilling', t('services.colNextBilling'))}
              <TableHead className="text-muted-foreground">{t('services.colSource')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services?.map((s) => {
              const provider = providerOf(s.providerUuid);
              const project = projectOf(s.projectUuid);
              return (
                <TableRow
                  key={s.uuid}
                  tabIndex={0}
                  onClick={() => onRowClick(s)}
                  onKeyDown={(e) => {
                    // Keyboard access: rows act as buttons opening the detail modal.
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(s);
                    }
                  }}
                  className={cn(
                    'cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none',
                    !s.isActive && 'opacity-50',
                  )}
                >
                  <TableCell className="py-3">
                    <div className="flex items-center gap-1.5 leading-none">
                      {LOCATED_TYPES.has(s.type) ? (
                        <span className="inline-flex size-[18px] shrink-0 items-center justify-center self-center text-[15px] leading-none">
                          {countryFlag(s.countryCode)}
                        </span>
                      ) : (
                        <ServiceTypeIcon
                          type={s.type}
                          model={serviceTypeModel(s.meta)}
                          marker={serviceTypeMarker(s.meta)}
                          markerBg={serviceTypeMarkerBg(s.meta)}
                        />
                      )}
                      {s.name.length > NAME_MAX_LENGTH ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-semibold leading-none">
                              {truncate(s.name, NAME_MAX_LENGTH)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{s.name}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="font-semibold leading-none">{s.name}</span>
                      )}
                      {!s.isActive && (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          {t('services.badgeInactive')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <EntityLabel
                      name={provider?.name ?? ''}
                      src={providerFavicon(provider ?? { faviconLink: null, loginUrl: null })}
                      iconName={provider?.iconName}
                      iconBg={provider?.iconBg}
                    />
                  </TableCell>
                  <TableCell>
                    <EntityLabel
                      name={project?.name ?? ''}
                      src={projectFavicon(project?.faviconLink ?? null)}
                      iconName={project?.iconName}
                      iconBg={project?.iconBg}
                    />
                  </TableCell>
                  <TableCell>{serviceTypeLabel(s.type)}</TableCell>
                  <TableCell>{formatCost(s.cost, s.currency)}</TableCell>
                  <TableCell>{periodLabel(s.period)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {formatDateShort(s.nextBillingAt)}
                      {s.nextBillingAt && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground"
                              aria-label={t('services.bumpTooltip')}
                              onClick={(e) => {
                                e.stopPropagation();
                                onBumpNextBilling(s);
                              }}
                              // Enter/Space on the focused button must not also open the row modal.
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <IconCalendarPlus className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('services.bumpTooltip')}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={s.isManaged ? 'default' : 'secondary'}
                      className={cn(
                        'text-[10px] uppercase tracking-wide',
                        s.isManaged && 'border-transparent bg-brand/15 text-brand',
                      )}
                    >
                      {s.isManaged ? t('services.sourceManaged') : t('services.sourceManual')}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && services?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <p className="py-4 text-center text-muted-foreground">{t('services.empty')}</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
