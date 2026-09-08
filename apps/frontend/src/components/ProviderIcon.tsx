import { createElement, useEffect, useState } from 'react';
import { DEFAULT_ICON_BG, iconFgForBg, resolveTablerIcon } from '@/components/tablerIconCatalog';
import { cn } from '@/lib/utils';
import { type IconTone, analyzeIconTone, toneOf } from '@/utils/iconTone';

// Neutral initial, swapped for the favicon once it loads through the backend proxy (404 or an
// expired session keeps the initial). The favicon sits bare next to the name, no box of its own:
// icons that carry an opaque plate show that plate with rounded corners, transparent glyphs
// float on the row. The one exception is contrast rescue, decided from the icon's own
// luminance via data-tone + theme variants (no theme subscription in JS): a white glyph gets a
// dark plate on the light theme, a black glyph a light one on the dark theme. Only the letter
// placeholder keeps a grey tile. A custom Tabler icon + bg overrides all of this.

interface Resolved {
  key: string;
  src: string | null;
  tone: IconTone | null;
}

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
  const key = src ?? '';
  const [resolved, setResolved] = useState<Resolved>({ key: '', src: null, tone: null });

  useEffect(() => {
    if (TablerIcon || !src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setResolved({ key, src, tone: analyzeIconTone(img) });
    };
    img.onerror = () => {
      if (!cancelled) setResolved({ key, src: null, tone: null });
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [TablerIcon, key, src]);

  const current = !TablerIcon && resolved.key === key ? resolved : null;
  const favicon = current?.src ?? null;
  const tone = current?.tone ?? null;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const radius = Math.round(size * 0.25);

  if (TablerIcon) {
    const bg = iconBg || DEFAULT_ICON_BG;
    const fg = iconFgForBg(bg);
    return (
      <div
        className="flex shrink-0 items-center justify-center ring-1 ring-black/10 ring-inset select-none"
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, color: fg }}
      >
        {createElement(TablerIcon, {
          size: Math.max(12, Math.round(size * 0.64)),
          stroke: 1.75,
          color: fg,
          'aria-hidden': true,
        })}
      </div>
    );
  }

  return (
    <div
      data-tone={toneOf(tone) ?? undefined}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden select-none',
        favicon
          ? 'data-[tone=light]:bg-neutral-800 dark:data-[tone=light]:bg-transparent dark:data-[tone=dark]:bg-neutral-200'
          : 'bg-secondary ring-1 ring-foreground/10 ring-inset',
      )}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {favicon ? (
        <img
          src={favicon}
          alt=""
          className={tone?.plate ? 'size-full object-cover' : 'size-full object-contain'}
          // A small inset keeps bare glyphs optically level with plates, which carry their own margins.
          style={tone?.plate ? undefined : { padding: Math.round(size * 0.08) }}
        />
      ) : (
        <span
          className="font-semibold text-foreground/70"
          style={{ fontSize: Math.max(10, Math.round(size * 0.46)) }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
