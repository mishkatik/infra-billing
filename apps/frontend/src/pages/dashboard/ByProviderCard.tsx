import type { AnalyticsSummary, Provider } from '@infra/shared';
import { IconChevronLeft, IconChevronRight, IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ProviderIcon } from '@/components/ProviderIcon';
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
import { cn } from '@/lib/utils';
import { providerFavicon } from '@/utils/favicon';
import { formatMoney } from '@/utils/format';
import { CardHeadRow } from '@/components/ink/CardHeadRow';

const PROVIDER_PAGE_SIZE = 5;

interface ByProviderCardProps {
  providerRows: AnalyticsSummary['byProvider'];
  base: string;
  providerOf: (uuid: string) => Provider | undefined;
}

export function ByProviderCard({ providerRows, base, providerOf }: ByProviderCardProps) {
  const { t } = useTranslation();
  const rows = [...providerRows].sort((a, b) => Number(b.spent) - Number(a.spent));
  const [providerPage, setProviderPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PROVIDER_PAGE_SIZE));
  // Clamp in case the provider list shrank below the current page.
  const page = Math.min(providerPage, pageCount);
  const rowsPage = rows.slice((page - 1) * PROVIDER_PAGE_SIZE, page * PROVIDER_PAGE_SIZE);
  // No providers: skip the card, the getting-started block in DashboardPage covers it.
  if (rows.length === 0) return null;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('dashboard.byProvider.title')} count={rows.length} />
      <Table className="min-w-[600px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">{t('dashboard.byProvider.colProvider')}</TableHead>
            <TableHead className="text-right">{t('dashboard.byProvider.colServices')}</TableHead>
            <TableHead className="text-right">{t('dashboard.byProvider.colMonthly')}</TableHead>
            <TableHead className="text-right">{t('dashboard.byProvider.colSpent')}</TableHead>
            <TableHead className="pr-6 text-right">
              {t('dashboard.byProvider.colBalance')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowsPage.map((p) => {
            const provider = providerOf(p.providerUuid);
            return (
              <TableRow key={p.providerUuid}>
                <TableCell className="pl-6">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      to={`/providers?selected=${p.providerUuid}`}
                      className="flex min-w-0 items-center gap-2 hover:underline"
                    >
                      <ProviderIcon
                        name={p.name}
                        src={providerFavicon(provider)}
                        iconName={provider?.iconName}
                        iconBg={provider?.iconBg}
                        size={18}
                      />
                      <span className="truncate">{p.name}</span>
                    </Link>
                    {provider?.loginUrl && (
                      <Button variant="ghost" size="icon-xs" className="text-ink-3" asChild>
                        <a
                          href={provider.loginUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t('dashboard.attention.openCabinetOf', { name: p.name })}
                          title={provider.loginUrl}
                        >
                          <IconExternalLink />
                        </a>
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right text-ink-2">{p.servicesCount}</TableCell>
                <TableCell className="text-right">{formatMoney(p.monthlyCost, base)}</TableCell>
                <TableCell className="text-right">{formatMoney(p.spent, base)}</TableCell>
                <TableCell
                  className={cn('pr-6 text-right', p.balances.length === 0 && 'text-ink-2')}
                >
                  {/* Accounts may hold different currencies: one line per currency. */}
                  {p.balances.length === 0
                    ? formatMoney(null)
                    : p.balances.map((b) => (
                        <div key={b.currency}>{formatMoney(b.amount, b.currency)}</div>
                      ))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {rows.length > PROVIDER_PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 border-t border-hairline px-6 py-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('dashboard.byProvider.prevPage')}
            disabled={page <= 1}
            onClick={() => setProviderPage(page - 1)}
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <span className="px-1 text-[13px] text-ink-2">
            {page} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('dashboard.byProvider.nextPage')}
            disabled={page >= pageCount}
            onClick={() => setProviderPage(page + 1)}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
