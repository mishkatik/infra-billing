import { IconFingerprint, IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { Passkey } from '@infra/shared';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate } from '@/utils/format';

interface PasskeysCardProps {
  passkeys: Passkey[] | undefined;
  canPasskey: boolean;
  adding: boolean;
  removing: boolean;
  onAdd: () => void;
  onRemove: (pk: Passkey) => void;
}

export function PasskeysCard({
  passkeys,
  canPasskey,
  adding,
  removing,
  onAdd,
  onRemove,
}: PasskeysCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('auth.passkeys.title')} count={passkeys?.length ?? 0}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span keeps the tooltip working over the disabled button */}
            <span>
              <Button variant="ghost" size="sm" disabled={!canPasskey || adding} onClick={onAdd}>
                {adding ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconPlus className="size-4" />
                )}
                {t('auth.passkeys.add')}
              </Button>
            </span>
          </TooltipTrigger>
          {!canPasskey && <TooltipContent>{t('auth.passkeys.unsupported')}</TooltipContent>}
        </Tooltip>
      </CardHeadRow>

      {passkeys && passkeys.length > 0 ? (
        <ul className="divide-y divide-hairline">
          {passkeys.map((pk) => (
            <li key={pk.uuid} className="flex items-center justify-between gap-3 px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-ink-2">
                  <IconFingerprint className="size-4.5" stroke={1.5} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium">{pk.name ?? t('auth.passkeys.unnamed')}</p>
                    {pk.backedUp && (
                      <span className="flex items-center gap-1.5 text-[13px] text-ok">
                        <InkGlyph state="ok" size={10} />
                        {t('auth.passkeys.backedUp')}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-ink-2">
                    {t('auth.passkeys.addedOn')} {formatDate(pk.createdAt)}
                    {' · '}
                    {pk.lastUsedAt ? (
                      <>
                        {t('auth.passkeys.lastUsedOn')} {formatDate(pk.lastUsedAt)}
                      </>
                    ) : (
                      t('auth.passkeys.neverUsed')
                    )}
                  </p>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.delete')}
                    className="hover:text-destructive"
                    disabled={removing}
                    onClick={() => onRemove(pk)}
                  >
                    {removing ? (
                      <IconLoader2 className="size-4 animate-spin" />
                    ) : (
                      <IconTrash stroke={1.5} className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('common.delete')}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-6 py-8 text-sm text-ink-2">{t('auth.passkeys.empty')}</p>
      )}
    </Card>
  );
}
