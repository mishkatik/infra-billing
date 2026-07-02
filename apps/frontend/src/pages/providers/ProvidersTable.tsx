import type { Provider } from '@infra/shared';
import { IconExternalLink, IconLoader2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ProviderIcon } from '@/components/ProviderIcon';
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
import { providerFavicon } from '@/utils/favicon';
import { formatDate, formatMoney } from '@/utils/format';

interface ProvidersTableProps {
  providers: Provider[] | undefined;
  isLoading: boolean;
  syncingUuid: string | undefined;
  kindLabel: (kind: string) => string;
  onRowClick: (p: Provider) => void;
}

export function ProvidersTable({
  providers,
  isLoading,
  syncingUuid,
  kindLabel,
  onRowClick,
}: ProvidersTableProps) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden py-0">
      <div className="overflow-x-auto">
        <Table className="min-w-[660px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-muted-foreground">{t('providers.th.name')}</TableHead>
              <TableHead className="text-muted-foreground">{t('providers.th.type')}</TableHead>
              <TableHead className="text-muted-foreground">{t('providers.th.balance')}</TableHead>
              <TableHead className="text-muted-foreground">{t('providers.th.services')}</TableHead>
              <TableHead className="text-muted-foreground">{t('providers.th.payments')}</TableHead>
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
                    <ProviderIcon name={p.name} src={providerFavicon(p)} />
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
                  {syncingUuid === p.uuid ? (
                    <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : p.lastSyncError ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {/* Soft fill: a solid destructive badge is too harsh here. */}
                        <Badge className="border-transparent bg-destructive/15 text-[10px] text-destructive uppercase tracking-wide">
                          {t('providers.syncError')}
                        </Badge>
                      </TooltipTrigger>
                      {/* text-pretty, not text-balance: balance shortens lines under max-w,
                          leaving an empty "squashed" box. */}
                      <TooltipContent className="max-w-[420px] whitespace-normal text-pretty px-3 py-2">
                        {p.lastSyncError}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {formatDate(p.lastSyncAt)}
                    </span>
                  )}
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
