import { createElement, useEffect, useState } from 'react';
import { DEFAULT_ICON_BG, iconFgForBg, resolveTablerIcon } from '@/components/tablerIconCatalog';
import { faviconRootFallback, isFaviconServiceUrl } from '@/utils/favicon';

// Neutral initial avatar, swapped for the favicon only once it loads. Google's "no favicon"
// placeholder is a ~16px globe: s2 candidates that small are rejected. Direct favicon URLs
// skip the gate — a panel's own icon may legitimately be 16px (BILLmanager .ico). When the
// primary favicon 404s or is rejected, fall back to the registrable domain's icon before
// settling on the initial. A custom Tabler icon + bg overrides the favicon path entirely.
export function ProviderIcon({
  name,
  src,
  iconName,
  iconBg,
  size = 22,
}: {
  name: string;
  src: string | null;
  iconName?: string | null;
  iconBg?: string | null;
  size?: number;
}) {
  const TablerIcon = resolveTablerIcon(iconName);
  const fallback = faviconRootFallback(src);
  const key = `${src ?? ''}|${fallback ?? ''}`;
  const [resolved, setResolved] = useState<{ key: string; src: string | null }>({
    key: '',
    src: null,
  });

  useEffect(() => {
    if (TablerIcon) return;
    const candidates = [src, fallback].filter((c): c is string => !!c);
    if (candidates.length === 0) {
      setResolved({ key, src: null });
      return;
    }
    let cancelled = false;
    const tryAt = (i: number) => {
      if (i >= candidates.length) {
        if (!cancelled) setResolved({ key, src: null });
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        if (!isFaviconServiceUrl(candidates[i]) || img.naturalWidth > 16) {
          setResolved({ key, src: candidates[i] });
        } else {
          tryAt(i + 1);
        }
      };
      img.onerror = () => {
        if (!cancelled) tryAt(i + 1);
      };
      img.src = candidates[i];
    };
    tryAt(0);
    return () => {
      cancelled = true;
    };
  }, [TablerIcon, key, src, fallback]);

  const favicon = !TablerIcon && resolved.key === key ? resolved.src : null;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const bg = iconBg || DEFAULT_ICON_BG;
  const fg = iconFgForBg(bg);
  const glyph = Math.max(12, Math.round(size * 0.64));

  if (TablerIcon) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-md border border-black/10 select-none"
        style={{ width: size, height: size, backgroundColor: bg, color: fg }}
      >
        {createElement(TablerIcon, {
          size: glyph,
          stroke: 1.75,
          color: fg,
          'aria-hidden': true,
        })}
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-secondary select-none"
      style={{ width: size, height: size }}
    >
      {favicon ? (
        <img src={favicon} alt="" className="size-full object-cover" />
      ) : (
        <span
          className="font-semibold text-secondary-foreground"
          style={{ fontSize: Math.max(10, Math.round(size * 0.5)) }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
