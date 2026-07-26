import type { AnalyticsSummary, Provider } from '@infra/shared';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/ProviderIcon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { providerFavicon } from '@/utils/favicon';
import { formatMoney } from '@/utils/format';

const PROVIDER_PAGE_SIZE = 5;

interface ByProviderCardProps {
  providerRows: AnalyticsSummary['byProvider'];
  base: string;
  isLoading: boolean;
  providerOf: (uuid: string) => Provider | undefined;
}

export function ByProviderCard({ providerRows, base, isLoading, providerOf }: ByProviderCardProps) {
  const { t } = useTranslation();
  const rows = [...providerRows].sort((a, b) => Number(b.spent) - Number(a.spent));
  const [providerPage, setProviderPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PROVIDER_PAGE_SIZE));
  // Clamp in case the provider list shrank below the current page.
  const page = Math.min(providerPage, pageCount);
  const rowsPage = rows.slice((page - 1) * PROVIDER_PAGE_SIZE, page * PROVIDER_PAGE_SIZE);
  // No providers — skip the card entirely (the shared CTA block lives in DashboardPage).
  if (rows.length === 0) return null;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>{t('dashboard.byProvider.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground">
                  {t('dashboard.byProvider.colProvider')}
                </TableHead>
                <TableHead className="text-right text-muted-foreground">
                  {t('dashboard.byProvider.colServices')}
                </TableHead>
                <TableHead className="text-right text-muted-foreground">
                  {t('dashboard.byProvider.colMonthly', { base })}
                </TableHead>
                <TableHead className="text-right text-muted-foreground">
                  {t('dashboard.byProvider.colSpent', { base })}
                </TableHead>
                <TableHead className="text-right text-muted-foreground">
                  {t('dashboard.byProvider.colBalance')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsPage.map((p) => (
                <TableRow key={p.providerUuid}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProviderIcon
                        name={p.name}
                        src={providerFavicon(
                          providerOf(p.providerUuid) ?? { faviconLink: null, loginUrl: null },
                        )}
                        iconName={providerOf(p.providerUuid)?.iconName}
                        iconBg={providerOf(p.providerUuid)?.iconBg}
                        size={18}
                      />
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{p.servicesCount}</TableCell>
                  <TableCell className="text-right">{formatMoney(p.monthlyCost, base)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatMoney(p.spent, base)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatMoney(p.balance, p.balanceCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isLoading ? t('common.loading') : t('dashboard.empty.noProviders')}
          </p>
        )}
        {rows.length > PROVIDER_PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setProviderPage(page - 1)}
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {page} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => setProviderPage(page + 1)}
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
