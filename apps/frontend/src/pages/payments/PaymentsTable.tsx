import type { Payment, Service } from '@infra/shared';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { CountryFlag } from '@/components/CountryFlag';
import { EntityLabel } from '@/components/EntityLabel';
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
import { cn } from '@/lib/utils';
import {
  LOCATED_TYPES,
  ServiceTypeIcon,
  serviceTypeMarker,
  serviceTypeMarkerBg,
  serviceTypeModel,
} from '@/pages/services/ServiceTypeIcon';
import { providerFavicon } from '@/utils/favicon';
import { type AccountRef, accountDisplayName } from '@/utils/providerState';
import { formatDateShort, formatMoney, truncate } from '@/utils/format';

const SERVICE_NAME_MAX_LENGTH = 40;

interface PaymentsTableProps {
  payments: Payment[];
  isLoading: boolean;
  total: number;
  accountOf: (accountUuid: string) => AccountRef | undefined;
  serviceOf: (uuid: string) => Service | undefined;
  onDelete: (uuid: string) => void;
}

// Same lead as the services table (flag for located types, type icon otherwise); links to the
// service card through the ?selected= deep link.
function ServiceLabel({ service }: { service: Service }) {
  const name =
    service.name.length > SERVICE_NAME_MAX_LENGTH ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{truncate(service.name, SERVICE_NAME_MAX_LENGTH)}</span>
        </TooltipTrigger>
        <TooltipContent>{service.name}</TooltipContent>
      </Tooltip>
    ) : (
      <span>{service.name}</span>
    );
  return (
    <Link
      to={`/services?selected=${service.uuid}`}
      className={cn(
        'inline-flex items-center gap-1.5 hover:underline',
        !service.isActive && 'opacity-50',
      )}
    >
      <span className="inline-flex shrink-0">
        {LOCATED_TYPES.has(service.type) ? (
          <CountryFlag code={service.countryCode} />
        ) : (
          <ServiceTypeIcon
            type={service.type}
            model={serviceTypeModel(service.meta)}
            marker={serviceTypeMarker(service.meta)}
            markerBg={serviceTypeMarkerBg(service.meta)}
          />
        )}
      </span>
      {name}
    </Link>
  );
}

export function PaymentsTable({
  payments,
  isLoading,
  total,
  accountOf,
  serviceOf,
  onDelete,
}: PaymentsTableProps) {
  const { t } = useTranslation();
  const mainLabel = t('common.accountMain');
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('payments.title')} count={total} />
      <div className="overflow-x-auto">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t('payments.colDate')}</TableHead>
              <TableHead>{t('payments.colProvider')}</TableHead>
              <TableHead>{t('payments.colService')}</TableHead>
              <TableHead>{t('payments.colType')}</TableHead>
              <TableHead className="text-right">{t('payments.colAmount')}</TableHead>
              <TableHead>{t('payments.colSource')}</TableHead>
              <TableHead>{t('payments.colDescription')}</TableHead>
              <TableHead className="w-10 pr-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => {
              const ref = accountOf(p.accountUuid);
              const provider = ref?.provider;
              const service = p.serviceUuid ? serviceOf(p.serviceUuid) : undefined;
              return (
                <TableRow key={p.uuid}>
                  <TableCell className="pl-6">{formatDateShort(p.paymentDate)}</TableCell>
                  <TableCell>
                    <EntityLabel
                      name={ref ? accountDisplayName(ref.provider, ref.account, mainLabel) : ''}
                      src={providerFavicon(provider)}
                      iconName={provider?.iconName}
                      iconBg={provider?.iconBg}
                    />
                  </TableCell>
                  <TableCell>
                    {/* An attributed payment stays blank until the services list loads. */}
                    {p.serviceUuid === null ? (
                      <span className="text-ink-3">{t('common.none')}</span>
                    ) : (
                      service && <ServiceLabel service={service} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {p.type === 'charge' ? t('payments.typeCharge') : t('payments.typeTopup')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatMoney(p.amount, p.currency)}</TableCell>
                  <TableCell className="text-[13px] text-ink-2">
                    {p.externalId != null ? (
                      <span title={p.externalId}>{t('payments.sourceAuto')}</span>
                    ) : (
                      t('payments.sourceManual')
                    )}
                  </TableCell>
                  <TableCell className="text-ink-2">
                    {p.description ? (
                      <span className="block max-w-[280px] truncate" title={p.description}>
                        {p.description}
                      </span>
                    ) : (
                      <span className="text-ink-3">{t('common.none')}</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-ink-3 hover:bg-fail-bg hover:text-destructive"
                        aria-label={t('common.delete')}
                        onClick={() => onDelete(p.uuid)}
                      >
                        <IconTrash />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && total === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-6 text-center text-ink-2">
                  {t('payments.empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
