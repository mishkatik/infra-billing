import type { Provider } from '@infra/shared';
import { IconExternalLink, IconLoader2, IconRefresh } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/ProviderIcon';
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
import { providerFavicon } from '@/utils/favicon';
import { formatDate, formatMoney } from '@/utils/format';
import type { ProviderSortKey } from './providersSort';

interface ProvidersTableProps {
  providers: Provider[] | undefined;
  isLoading: boolean;
  syncingUuid: string | undefined;
  kindLabel: (kind: string) => string;
  sort: SortState<ProviderSortKey> | null;
  onToggleSort: (key: ProviderSortKey) => void;
  onRowClick: (p: Provider) => void;
  onSync: (uuid: string) => void;
}

export function ProvidersTable({
  providers,
  isLoading,
  syncingUuid,
  kindLabel,
  sort,
  onToggleSort,
  onRowClick,
  onSync,
}: ProvidersTableProps) {
  const { t } = useTranslation();
  const sortHead = (key: ProviderSortKey, label: string) => (
    <SortableTableHead
      label={label}
      active={sort?.key === key ? sort.dir : null}
      onToggle={() => onToggleSort(key)}
    />
  );
  return (
    <Card className="overflow-hidden py-0">
      <div className="overflow-x-auto">
        <Table className="min-w-[660px]">
          <TableHeader>
            <TableRow>
              {sortHead('name', t('providers.th.name'))}
              <TableHead className="text-muted-foreground">{t('providers.th.type')}</TableHead>
              {sortHead('balance', t('providers.th.balance'))}
              {sortHead('services', t('providers.th.services'))}
              {sortHead('payments', t('providers.th.payments'))}
              <TableHead className="text-muted-foreground">{t('providers.th.sync')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers?.map((p) => (
              <TableRow
                key={p.uuid}
                tabIndex={0}
                className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
                onClick={() => onRowClick(p)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  // Space scrolls the page by default; Enter doesn't.
                  if (e.key === ' ') e.preventDefault();
                  onRowClick(p);
                }}
              >
                <TableCell className="py-3">
                  <div className="flex items-center gap-2">
                    <ProviderIcon
                      name={p.name}
                      src={providerFavicon(p)}
                      iconName={p.iconName}
                      iconBg={p.iconBg}
                    />
                    <span className="font-semibold">{p.name}</span>
                    {p.loginUrl && (
                      <Button
                        asChild
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                      >
                        <a
                          href={p.loginUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={p.loginUrl}
                          onClick={(e) => e.stopPropagation()}
                          // Keyboard too: Enter on the focused anchor must not also open the row modal.
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <IconExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    {kindLabel(p.kind)}
                  </Badge>
                </TableCell>
                <TableCell>{formatMoney(p.balance, p.balanceCurrency)}</TableCell>
                <TableCell>{p.servicesCount ?? 0}</TableCell>
                <TableCell>{p.paymentsCount ?? 0}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    {p.lastSyncError ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge className="border-transparent bg-destructive/15 text-[10px] text-destructive uppercase tracking-wide">
                            {t('providers.syncError')}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[420px] whitespace-normal text-pretty px-3 py-2">
                          {p.lastSyncError}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="leading-none text-muted-foreground">
                        {formatDate(p.lastSyncAt)}
                      </span>
                    )}
                    {p.kind !== 'manual' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                        disabled={syncingUuid === p.uuid}
                        aria-label={t('providers.detail.syncNow')}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSync(p.uuid);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {syncingUuid === p.uuid ? (
                          <IconLoader2 className="size-3.5 animate-spin" />
                        ) : (
                          <IconRefresh className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && providers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <p className="py-4 text-center text-muted-foreground">{t('providers.empty')}</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
