import type { Project, Provider, Service } from '@infra/shared';
import { useTranslation } from 'react-i18next';
import { EntityLabel } from '@/components/EntityLabel';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import { projectFavicon, providerFavicon } from '@/utils/favicon';
import { countryFlag, formatCost, formatDateShort, truncate } from '@/utils/format';
import { LOCATED_TYPES, ServiceTypeIcon } from './ServiceTypeIcon';

const NAME_MAX_LENGTH = 40;

interface ServicesTableProps {
  services: Service[] | undefined;
  isLoading: boolean;
  providerOf: (uuid: string) => Provider | undefined;
  projectOf: (uuid: string) => Project | undefined;
  serviceTypeLabel: (type: string) => string;
  periodLabel: (period: string) => string;
  onRowClick: (s: Service) => void;
}

export function ServicesTable({
  services,
  isLoading,
  providerOf,
  projectOf,
  serviceTypeLabel,
  periodLabel,
  onRowClick,
}: ServicesTableProps) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden py-0">
      <div className="overflow-x-auto">
        <Table className="min-w-[740px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-muted-foreground">{t('services.colName')}</TableHead>
              <TableHead className="text-muted-foreground">{t('services.colProvider')}</TableHead>
              <TableHead className="text-muted-foreground">{t('services.colProject')}</TableHead>
              <TableHead className="text-muted-foreground">{t('services.colType')}</TableHead>
              <TableHead className="text-muted-foreground">{t('services.colCost')}</TableHead>
              <TableHead className="text-muted-foreground">{t('services.colPeriod')}</TableHead>
              <TableHead className="text-muted-foreground">
                {t('services.colNextBilling')}
              </TableHead>
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
                    <div className="flex items-center gap-1.5">
                      {LOCATED_TYPES.has(s.type) ? (
                        <span>{countryFlag(s.countryCode)}</span>
                      ) : (
                        <ServiceTypeIcon type={s.type} />
                      )}
                      {s.name.length > NAME_MAX_LENGTH ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-semibold">
                              {truncate(s.name, NAME_MAX_LENGTH)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{s.name}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="font-semibold">{s.name}</span>
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
                    />
                  </TableCell>
                  <TableCell>
                    <EntityLabel
                      name={project?.name ?? ''}
                      src={projectFavicon(project?.faviconLink ?? null)}
                    />
                  </TableCell>
                  <TableCell>{serviceTypeLabel(s.type)}</TableCell>
                  <TableCell>{formatCost(s.cost, s.currency)}</TableCell>
                  <TableCell>{periodLabel(s.period)}</TableCell>
                  <TableCell>{formatDateShort(s.nextBillingAt)}</TableCell>
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
