import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ProviderIcon } from '@/components/ProviderIcon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { providerFavicon } from '@/utils/favicon';
import { countryFlag } from '@/utils/format';
import { countryBadgeStyle, providerBadgeStyle } from './badgeTints';
import { createLayoutGate } from './layoutMeasure';

export function ProviderBadge({
  name,
  kind,
  faviconLink,
  loginUrl,
  iconName,
  iconBg,
}: {
  name: string;
  kind?: string | null;
  faviconLink?: string | null;
  loginUrl?: string | null;
  iconName?: string | null;
  iconBg?: string | null;
}) {
  const tint = providerBadgeStyle(kind);
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border py-0.5 pr-2 pl-1 font-normal shadow-none"
      style={tint}
    >
      <ProviderIcon
        name={name}
        src={providerFavicon({ faviconLink: faviconLink ?? null, loginUrl: loginUrl ?? null })}
        iconName={iconName}
        iconBg={iconBg}
        size={16}
      />
      <span style={{ color: tint.color }}>{name}</span>
    </Badge>
  );
}

export function ServiceBadge({ countryCode, name }: { countryCode?: string | null; name: string }) {
  const flag = countryFlag(countryCode);
  return (
    <Badge
      variant="outline"
      className="gap-1 border font-medium"
      style={countryBadgeStyle(countryCode)}
    >
      {flag ? <span className="text-sm leading-none">{flag}</span> : null}
      {name}
    </Badge>
  );
}

export function leaderOpacity(index: number): number {
  if (index === 0) return 0.55;
  if (index === 1) return 0.4;
  if (index === 2) return 0.28;
  return index % 2 === 0 ? 0.2 : 0.12;
}

export function clusterOneLineWidth(el: HTMLElement): number {
  const kids = Array.from(el.children) as HTMLElement[];
  const prev = {
    flexWrap: el.style.flexWrap,
    width: el.style.width,
    maxWidth: el.style.maxWidth,
    minWidth: el.style.minWidth,
  };
  const prevKids = kids.map((k) => ({ flexShrink: k.style.flexShrink }));
  el.style.flexWrap = 'nowrap';
  el.style.width = 'max-content';
  el.style.maxWidth = 'none';
  el.style.minWidth = 'max-content';
  for (const k of kids) k.style.flexShrink = '0';
  const width = Math.ceil(el.getBoundingClientRect().width);
  el.style.flexWrap = prev.flexWrap;
  el.style.width = prev.width;
  el.style.maxWidth = prev.maxWidth;
  el.style.minWidth = prev.minWidth;
  kids.forEach((k, i) => {
    k.style.flexShrink = prevKids[i]?.flexShrink ?? '';
  });
  return width;
}

export function clusterIsWrapped(el: HTMLElement): boolean {
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length < 2) return false;
  const top = kids[0].offsetTop;
  return kids.some((k) => Math.abs(k.offsetTop - top) > 2);
}

const AlertDateCtx = createContext(true);

export function AlertChargeGrid({
  showDate = false,
  showBalance = false,
  collapseDateWhenTight = false,
  deps,
  children,
}: {
  showDate?: boolean;
  showBalance?: boolean;
  collapseDateWhenTight?: boolean;
  deps?: unknown;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hideRef = useRef(false);
  const dateWidthRef = useRef(72);
  const [hideDate, setHideDate] = useState(false);
  const effectiveShowDate = showDate && !(collapseDateWhenTight && hideDate);
  const metaCols = [showBalance, true, effectiveShowDate, true].filter(Boolean).length;

  useLayoutEffect(() => {
    if (!collapseDateWhenTight || !showDate) {
      hideRef.current = false;
      setHideDate(false);
      return;
    }
    const root = ref.current;
    if (!root) return;
    const gate = createLayoutGate();

    const applyHide = (next: boolean) => {
      if (hideRef.current === next) return;
      hideRef.current = next;
      gate.afterChange();
      setHideDate(next);
    };

    const measure = () => {
      if (gate.shouldSkip()) return;
      const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-alert-row]'));
      if (rows.length === 0) return;

      if (!hideRef.current) {
        let max = dateWidthRef.current;
        for (const d of root.querySelectorAll<HTMLElement>('[data-alert-date]')) {
          max = Math.max(max, Math.ceil(d.getBoundingClientRect().width));
        }
        dateWidthRef.current = max;
      }

      const gap =
        Number.parseFloat(getComputedStyle(root).columnGap || getComputedStyle(root).gap || '0') ||
        0;
      const available = root.clientWidth;
      const dateW = dateWidthRef.current;
      const slack = hideRef.current ? 64 : 16;

      const fitsWithDate = rows.every((row) => {
        const who = row.querySelector<HTMLElement>('[data-alert-who]');
        const leader = row.querySelector<HTMLElement>('[data-alert-leader]');
        const metas = Array.from(row.querySelectorAll<HTMLElement>('[data-alert-meta]'));
        const whoW = who ? clusterOneLineWidth(who) : 0;
        const leaderMin = leader
          ? Number.parseFloat(getComputedStyle(leader).minWidth || '0') || 12
          : 0;
        const metaW = metas.reduce((sum, m) => sum + Math.ceil(m.scrollWidth), 0);
        const metaCount = metas.length + (hideRef.current ? 1 : 0);
        return (
          whoW + gap + leaderMin + metaW + dateW + gap * Math.max(metaCount, 0) <= available - slack
        );
      });

      if (!hideRef.current) {
        const tight = rows.some((row) => {
          const who = row.querySelector<HTMLElement>('[data-alert-who]');
          const leader = row.querySelector<HTMLElement>('[data-alert-leader]');
          if (who && clusterIsWrapped(who)) return true;
          return Boolean(leader && leader.clientWidth <= 14);
        });
        if (tight || !fitsWithDate) applyHide(true);
        return;
      }

      if (fitsWithDate) applyHide(false);
    };

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [collapseDateWhenTight, showDate, deps]);

  return (
    <AlertDateCtx.Provider value={effectiveShowDate}>
      <div
        ref={ref}
        className={cn(
          'grid w-full items-center gap-x-2 gap-y-2 text-sm',
          metaCols === 4 && 'grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]',
          metaCols === 3 && 'grid-cols-[minmax(0,1fr)_auto_auto_auto]',
          metaCols === 2 && 'grid-cols-[minmax(0,1fr)_auto_auto]',
        )}
      >
        {children}
      </div>
    </AlertDateCtx.Provider>
  );
}

export function AlertChargeRow({
  index,
  who,
  balance,
  badge,
  date,
  amount,
}: {
  index: number;
  who: ReactNode;
  balance?: ReactNode;
  badge: ReactNode;
  date?: ReactNode;
  amount: ReactNode;
}) {
  const showDate = useContext(AlertDateCtx);
  return (
    <div className="contents" data-alert-row="">
      <div className="flex min-w-0 items-center gap-x-2">
        <div data-alert-who="" className="flex min-w-0 flex-wrap items-center gap-1.5">
          {who}
        </div>
        <div
          data-alert-leader=""
          aria-hidden
          className="h-[3px] min-w-3 flex-1 self-center"
          style={{
            opacity: leaderOpacity(index),
            backgroundImage:
              'radial-gradient(circle closest-side, currentColor 1.35px, transparent 1.4px)',
            backgroundSize: '9px 3px',
            backgroundRepeat: 'repeat-x',
            backgroundPosition: 'left center',
          }}
        />
      </div>
      {balance != null ? (
        <div data-alert-meta="" className="justify-self-end">
          {balance}
        </div>
      ) : null}
      <div data-alert-meta="" className="justify-self-end">
        {badge}
      </div>
      {date != null && showDate ? (
        <div data-alert-meta="" data-alert-date="" className="justify-self-end">
          {date}
        </div>
      ) : null}
      <div
        data-alert-meta=""
        className="justify-self-end font-semibold text-foreground tabular-nums"
      >
        {amount}
      </div>
    </div>
  );
}
