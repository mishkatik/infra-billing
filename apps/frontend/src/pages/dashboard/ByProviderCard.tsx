import type { AnalyticsSummary, Provider } from '@infra/shared';
import { IconChevronLeft, IconChevronRight, IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
  const rows = [...providerRows].sort((a, b) => Number(b.spent ?? 0) - Number(a.spent ?? 0));
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
              {rowsPage.map((p) => {
                const provider = providerOf(p.providerUuid);
                return (
                  <TableRow key={p.providerUuid}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/providers?selected=${p.providerUuid}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <ProviderIcon
                            name={p.name}
                            src={providerFavicon(provider ?? { faviconLink: null, loginUrl: null })}
                            iconName={provider?.iconName}
                            iconBg={provider?.iconBg}
                            size={18}
                          />
                          <span className="text-sm font-medium">{p.name}</span>
                        </Link>
                        {provider?.loginUrl && (
                          <a
                            href={provider.loginUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={provider.loginUrl}
                            className="inline-flex shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <IconExternalLink className="size-3.5" />
                          </a>
                        )}
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
                );
              })}
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
