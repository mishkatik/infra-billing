import { IconExternalLink } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { InkGlyph } from '@/components/ink/InkGlyph';
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
import {
  type AttentionGroups,
  type AttentionRow,
  accountLink,
  withAccount,
} from './dashboardUtils';

function CabinetLink({ url, name }: { url: string | null; name: string }) {
  const { t } = useTranslation();
  if (!url) return null;
  return (
    <Button variant="ghost" size="icon-xs" className="text-ink-3" asChild>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={t('dashboard.attention.openCabinetOf', { name })}
        title={url}
      >
        <IconExternalLink />
      </a>
    </Button>
  );
}

interface AttentionCardProps {
  title: string;
  rows: AttentionRow[];
  /** Column heads: subject, note, when, amount. */
  cols: [string, string, string, string];
  className?: string;
}

function AttentionCard({ title, rows, cols, className }: AttentionCardProps) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <Card className={cn('min-w-0 gap-0 overflow-hidden py-0', className)}>
      <CardHeadRow title={title} count={rows.length} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-6">
              <span className="sr-only">{t('dashboard.table.status')}</span>
            </TableHead>
            <TableHead>{cols[0]}</TableHead>
            <TableHead>{cols[1]}</TableHead>
            <TableHead>{cols[2]}</TableHead>
            <TableHead className="text-right">{cols[3]}</TableHead>
            <TableHead className="w-10 pr-6">
              <span className="sr-only">{t('dashboard.attention.openCabinet')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const failed = r.state === 'failed';
            const tone = failed ? 'text-destructive' : 'text-warn';
            const providerName = withAccount(
              r.provider.name,
              r.provider.accountLabel,
              t('common.accountMain'),
            );
            const providerHref = accountLink(r.provider.uuid, r.provider.accountUuid);
            return (
              <TableRow key={r.key} className={cn(failed && '*:bg-fail-bg')}>
                <TableCell className="pl-6">
                  <InkGlyph
                    state={r.state}
                    label={
                      failed ? t('dashboard.attention.critical') : t('dashboard.attention.warning')
                    }
                  />
                </TableCell>
                <TableCell className="max-w-0 min-w-48">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderIcon
                      name={r.provider.name}
                      src={providerFavicon(r.provider)}
                      iconName={r.provider.iconName}
                      iconBg={r.provider.iconBg}
                      size={18}
                    />
                    {r.service ? (
                      <>
                        <Link
                          to={`/services?selected=${r.service.uuid}`}
                          className="truncate hover:underline"
                        >
                          {r.service.name}
                        </Link>
                        <Link
                          to={providerHref}
                          className="truncate text-[13px] text-ink-2 hover:underline"
                        >
                          {providerName}
                        </Link>
                      </>
                    ) : (
                      <Link to={providerHref} className="truncate hover:underline">
                        {providerName}
                      </Link>
                    )}
                  </div>
                </TableCell>
                {/* Wraps instead of truncating: the coverage note is the point of the row. */}
                <TableCell className={cn('min-w-40 text-[13px] whitespace-normal', tone)}>
                  {r.note}
                </TableCell>
                <TableCell className="text-[13px] text-ink-2">{r.when}</TableCell>
                <TableCell className="text-right">{r.amount}</TableCell>
                <TableCell className="pr-6">
                  <CabinetLink url={r.provider.loginUrl} name={providerName} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

/**
 * The remedy side of the uncovered charges: a compact list (it often sits in a narrow column)
 * with the account and the amount to top up, and under it which charges it saves and by when.
 */
function TopUpCard({ rows }: { rows: AttentionRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('dashboard.attention.topUpTitle')} count={rows.length} />
      <ul className="divide-y divide-hairline">
        {rows.map((r) => {
          const providerName = withAccount(
            r.provider.name,
            r.provider.accountLabel,
            t('common.accountMain'),
          );
          return (
            <li key={r.key} className="flex items-center gap-3 px-6 py-3">
              <InkGlyph state={r.state} label={t('dashboard.attention.warning')} />
              <ProviderIcon
                name={r.provider.name}
                src={providerFavicon(r.provider)}
                iconName={r.provider.iconName}
                iconBg={r.provider.iconBg}
                size={18}
              />
              <div className="min-w-0 flex-1">
                <Link
                  to={accountLink(r.provider.uuid, r.provider.accountUuid)}
                  className="block truncate hover:underline"
                >
                  {providerName}
                </Link>
                <p className="text-[13px] text-ink-2">
                  {t('dashboard.attention.topUpFor', { names: r.note, when: r.when })}
                </p>
              </div>
              <span className="shrink-0 font-medium text-warn">{r.amount}</span>
              <CabinetLink url={r.provider.loginUrl} name={providerName} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * One card per kind of problem, so a problem and its remedy never read as two separate issues:
 * overdue charges, charges the balance won't cover with the matching top-ups beside them, then
 * balances about to run dry.
 */
export function AttentionCards({ groups }: { groups: AttentionGroups }) {
  const { t } = useTranslation();
  const { overdue, uncovered, topUps, runway } = groups;
  if (overdue.length + uncovered.length + topUps.length + runway.length === 0) return null;
  const pair = uncovered.length > 0 && topUps.length > 0;
  return (
    <div className="space-y-8">
      <AttentionCard
        title={t('dashboard.attention.overdueTitle')}
        rows={overdue}
        cols={[
          t('dashboard.attention.colService'),
          t('dashboard.attention.colOverdue'),
          t('dashboard.attention.colDue'),
          t('dashboard.attention.colAmount'),
        ]}
      />
      {(uncovered.length > 0 || topUps.length > 0) && (
        // Side by side only where the uncovered table still has room for its columns.
        <div
          className={cn(
            'grid gap-8',
            pair && 'min-[1680px]:grid-cols-[minmax(0,1fr)_26rem] min-[1680px]:items-start',
          )}
        >
          <AttentionCard
            title={t('dashboard.attention.uncoveredTitle')}
            rows={uncovered}
            cols={[
              t('dashboard.attention.colService'),
              t('dashboard.attention.colCoverage'),
              t('dashboard.attention.colWhen'),
              t('dashboard.attention.colAmount'),
            ]}
          />
          <TopUpCard rows={topUps} />
        </div>
      )}
      <AttentionCard
        title={t('dashboard.attention.runwayTitle')}
        rows={runway}
        cols={[
          t('dashboard.attention.colAccount'),
          t('dashboard.attention.colRunsOut'),
          t('dashboard.attention.colRate'),
          t('dashboard.attention.colBalance'),
        ]}
      />
    </div>
  );
}
