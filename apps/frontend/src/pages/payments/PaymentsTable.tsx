import type { Payment, Provider } from '@infra/shared';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
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
import { providerFavicon } from '@/utils/favicon';
import { formatDateShort, formatMoney } from '@/utils/format';

interface PaymentsTableProps {
  payments: Payment[];
  isLoading: boolean;
  total: number;
  providerOf: (uuid: string) => Provider | undefined;
  onDelete: (uuid: string) => void;
}

export function PaymentsTable({
  payments,
  isLoading,
  total,
  providerOf,
  onDelete,
}: PaymentsTableProps) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden py-0">
      <div className="overflow-x-auto">
        <Table className="min-w-[720px] [&_td]:py-3">
          <TableHeader>
            <TableRow className="[&_th]:text-muted-foreground">
              <TableHead>{t('payments.colDate')}</TableHead>
              <TableHead>{t('payments.colProvider')}</TableHead>
              <TableHead>{t('payments.colType')}</TableHead>
              <TableHead>{t('payments.colAmount')}</TableHead>
              <TableHead>{t('payments.colDescription')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => {
              const provider = providerOf(p.providerUuid);
              return (
                <TableRow key={p.uuid}>
                  <TableCell>{formatDateShort(p.paymentDate)}</TableCell>
                  <TableCell>
                    <EntityLabel
                      name={provider?.name ?? ''}
                      src={providerFavicon(provider ?? { faviconLink: null, loginUrl: null })}
                    />
                  </TableCell>
                  <TableCell>
                    {p.type === 'charge' ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {t('payments.typeCharge')}
                      </Badge>
                    ) : (
                      <Badge className="border-transparent bg-success/15 text-[10px] text-success uppercase tracking-wide">
                        {t('payments.typeTopup')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {formatMoney(p.amount, p.currency)}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {p.description ?? t('common.none')}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('common.delete')}
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(p.uuid)}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && total === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
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
