import { IconArrowUpRight, IconCheck, IconCopy, IconTicket } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import rwpLogo from '@/assets/rwp-logo.svg';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const RWP_URL = 'https://rwp.rw/';
const PROMO_CODE = 'MISH';

// The discount chip: brand copy, the same in every language.
const DISCOUNT = '−15%';

/**
 * Sidebar coupon for RWP Shop (rwp.rw) — the first Remnawave bot, integrates with Infra Billing.
 * A quiet dashed "tear-off" row; the popover carries the details and the promo code.
 */
export function RwpPromo() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(PROMO_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('app.rwp.title')}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-dashed border-border px-3.5 text-left text-[13px] outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <IconTicket aria-hidden stroke={1.5} className="size-[15px] shrink-0 text-ink-3" />
          <span className="flex-1 truncate">{t('app.rwp.title')}</span>
          <span className="text-xs text-ink-2">{DISCOUNT}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent side="right" align="end" className="w-80 p-0">
        <div className="flex items-center gap-3 border-b border-hairline p-4">
          {/* The RWP mark is drawn for a dark backdrop, so it always sits on an ink tile. */}
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#141310]">
            <img src={rwpLogo} alt="RWP" className="size-7 grayscale" />
          </div>
          <div className="flex items-center gap-2 text-[15px] font-medium">
            {t('app.rwp.title')}
            <span className="text-xs font-normal text-ink-2">{DISCOUNT}</span>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-[13px] text-ink-2">{t('app.rwp.description')}</p>

          <button
            type="button"
            onClick={copy}
            aria-label={copied ? t('app.rwp.copied') : t('app.rwp.copy')}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left transition-colors hover:bg-background"
          >
            <span className="text-xs text-ink-2">
              {copied ? t('app.rwp.copied') : t('app.rwp.promo')}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-sm">
              {PROMO_CODE}
              {copied ? (
                <IconCheck className="size-3.5" />
              ) : (
                <IconCopy className="size-3.5 text-ink-3" />
              )}
            </span>
          </button>

          <Button asChild size="sm" className="w-full">
            <a href={RWP_URL} target="_blank" rel="noopener noreferrer">
              {t('app.rwp.open')}
              <IconArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
