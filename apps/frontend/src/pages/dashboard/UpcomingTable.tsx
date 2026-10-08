import type { AnalyticsSummary } from '@infra/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { ProviderIcon } from '@/components/ProviderIcon';
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
import { formatDateShort, formatMoney } from '@/utils/format';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import {
  accountLink,
  byDaysUntil,
  coverageLabel,
  dayLabel,
  upcomingState,
  withAccount,
} from './dashboardUtils';

type Upcoming = AnalyticsSummary['upcomingBillings'][number];

/** Tone of the coverage word, in step with the dot: critical is a failure, short of that a heads-up. */
function coverageTone(b: Upcoming): string {
  if (b.severity === 'critical') return 'text-destructive';
  return b.covered === true ? 'text-ok' : 'text-warn';
}

export function UpcomingTable({ upcoming }: { upcoming: AnalyticsSummary['upcomingBillings'] }) {
  const { t } = useTranslation();
  if (upcoming.length === 0) return null;
  const rows = [...upcoming].sort(byDaysUntil);
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('dashboard.upcoming.title')} count={rows.length} />
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-6">
              <span className="sr-only">{t('dashboard.table.status')}</span>
            </TableHead>
            <TableHead>{t('dashboard.upcoming.colService')}</TableHead>
            <TableHead>{t('dashboard.upcoming.colProvider')}</TableHead>
            <TableHead>{t('dashboard.upcoming.colDate')}</TableHead>
            <TableHead>{t('dashboard.upcoming.colIn')}</TableHead>
            <TableHead>{t('dashboard.upcoming.colCoverage')}</TableHead>
            <TableHead className="pr-6 text-right">{t('dashboard.upcoming.colAmount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => {
            const coverage = coverageLabel(t, b.covered);
            const state = upcomingState(b);
            return (
              <TableRow key={b.serviceUuid} className={cn(state === 'failed' && '*:bg-fail-bg')}>
                <TableCell className="pl-6">
                  <InkGlyph state={state} label={coverage} />
                </TableCell>
                <TableCell className="max-w-[16rem]">
                  <Link
                    to={`/services?selected=${b.serviceUuid}`}
                    className="block truncate hover:underline"
                  >
                    {b.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    to={accountLink(b.providerUuid, b.accountUuid)}
                    className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2 hover:underline"
                  >
                    <ProviderIcon
                      name={b.providerName}
                      src={providerFavicon({
                        uuid: b.providerUuid,
                        faviconLink: b.providerFaviconLink,
                        loginUrl: b.providerLoginUrl,
                      })}
                      iconName={b.providerIconName}
                      iconBg={b.providerIconBg}
                      size={18}
                    />
                    <span className="truncate">
                      {withAccount(b.providerName, b.accountLabel, t('common.accountMain'))}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-[13px] text-ink-2">
                  {formatDateShort(b.nextBillingAt)}
                </TableCell>
                <TableCell className="text-[13px] text-ink-2">{dayLabel(t, b.daysUntil)}</TableCell>
                <TableCell className={cn('text-[13px]', coverageTone(b))}>{coverage}</TableCell>
                <TableCell className="pr-6 text-right">{formatMoney(b.cost, b.currency)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
