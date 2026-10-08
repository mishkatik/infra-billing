import type { Project, Service } from '@infra/shared';
import { IconCalendarPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '@/components/CountryFlag';
import { EntityLabel } from '@/components/EntityLabel';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { SortableTableHead } from '@/components/SortableTableHead';
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
import { type AccountRef, accountDisplayName } from '@/utils/providerState';
import { formatCost, formatDateShort, truncate } from '@/utils/format';
import type { ServiceSortKey } from './servicesSort';
import { ServiceSourceBadge } from './ServiceSourceBadge';
import {
  LOCATED_TYPES,
  ServiceTypeIcon,
  serviceTypeMarker,
  serviceTypeMarkerBg,
  serviceTypeModel,
} from './ServiceTypeIcon';

const NAME_MAX_LENGTH = 40;
const DESCRIPTION_MAX_LENGTH = 60;
const COLUMNS = 9;

// Metered and one-off services are left out, as in the dashboard's overdue list: a past date
// there only means the next sync hasn't moved it yet.
const NO_OVERDUE_PERIODS = new Set(['daily', 'hourly', 'onetime']);

/** An active service whose billing date has passed without being moved on. */
function isOverdue(s: Service): boolean {
  if (!s.isActive || !s.nextBillingAt || NO_OVERDUE_PERIODS.has(s.period)) return false;
  // UTC date parts on both sides, like the backend's overdue math.
  return s.nextBillingAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

interface ServicesTableProps {
  services: Service[] | undefined;
  isLoading: boolean;
  accountOf: (accountUuid: string) => AccountRef | undefined;
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
  accountOf,
  projectOf,
  serviceTypeLabel,
  periodLabel,
  sort,
  onToggleSort,
  onRowClick,
  onBumpNextBilling,
}: ServicesTableProps) {
  const { t } = useTranslation();
  const mainLabel = t('common.accountMain');
  const sortHead = (key: ServiceSortKey, label: string, className?: string) => (
    <SortableTableHead
      label={label}
      active={sort?.key === key ? sort.dir : null}
      onToggle={() => onToggleSort(key)}
      className={className}
    />
  );
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('services.title')} count={services?.length} />
      <div className="overflow-x-auto">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-6">
                <span className="sr-only">{t('services.colStatus')}</span>
              </TableHead>
              {sortHead('name', t('services.colName'))}
              {sortHead('provider', t('services.colProvider'))}
              {sortHead('project', t('services.colProject'))}
              {sortHead('type', t('services.colType'))}
              {sortHead(
                'cost',
                t('services.colCost'),
                'text-right [&>button]:-mr-2 [&>button]:ml-0',
              )}
              {sortHead('period', t('services.colPeriod'))}
              {sortHead('nextBilling', t('services.colNextBilling'))}
              <TableHead className="pr-6">{t('services.colSource')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services?.map((s) => {
              const ref = accountOf(s.accountUuid);
              const provider = ref?.provider;
              const project = projectOf(s.projectUuid);
              const overdue = isOverdue(s);
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
                    'cursor-pointer focus-visible:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    !s.isActive && 'opacity-50',
                  )}
                >
                  <TableCell className="w-10 pl-6">
                    <InkGlyph
                      state={s.isActive ? 'ok' : 'off'}
                      label={t(s.isActive ? 'services.statusActive' : 'services.statusInactive')}
                    />
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="flex min-w-0 items-center gap-2">
                      {LOCATED_TYPES.has(s.type) ? (
                        <CountryFlag code={s.countryCode} />
                      ) : (
                        <ServiceTypeIcon
                          type={s.type}
                          model={serviceTypeModel(s.meta)}
                          marker={serviceTypeMarker(s.meta)}
                          markerBg={serviceTypeMarkerBg(s.meta)}
                        />
                      )}
                      <div className="min-w-0">
                        {s.name.length > NAME_MAX_LENGTH ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="truncate font-medium">
                                {truncate(s.name, NAME_MAX_LENGTH)}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>{s.name}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <p className="truncate font-medium">{s.name}</p>
                        )}
                        {s.description &&
                          (s.description.length > DESCRIPTION_MAX_LENGTH ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="truncate text-[13px] text-ink-2">
                                  {truncate(s.description, DESCRIPTION_MAX_LENGTH)}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">{s.description}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <p className="truncate text-[13px] text-ink-2">{s.description}</p>
                          ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <EntityLabel
                      name={ref ? accountDisplayName(ref.provider, ref.account, mainLabel) : ''}
                      src={providerFavicon(provider)}
                      iconName={provider?.iconName}
                      iconBg={provider?.iconBg}
                    />
                  </TableCell>
                  <TableCell>
                    <EntityLabel
                      name={project?.name ?? ''}
                      src={projectFavicon(project)}
                      iconName={project?.iconName}
                      iconBg={project?.iconBg}
                    />
                  </TableCell>
                  <TableCell>{serviceTypeLabel(s.type)}</TableCell>
                  <TableCell className="text-right">{formatCost(s.cost, s.currency)}</TableCell>
                  <TableCell>{periodLabel(s.period)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className={overdue ? 'text-destructive' : undefined}>
                        {formatDateShort(s.nextBillingAt)}
                        {overdue && <span className="sr-only"> ({t('services.overdue')})</span>}
                      </span>
                      {s.nextBillingAt && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="text-ink-3 hover:text-foreground"
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
                  <TableCell className="pr-6">
                    <ServiceSourceBadge managed={s.isManaged} />
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && services?.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMNS}>
                  <p className="py-4 text-center text-ink-2">{t('services.empty')}</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
