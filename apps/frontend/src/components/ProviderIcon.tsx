import { useEffect, useState } from 'react';
import {
  DEFAULT_ICON_BG,
  iconFgForBg,
  resolveTablerIcon,
} from '@/components/tablerIconCatalog';
import { faviconRootFallback } from '@/utils/favicon';

// Neutral initial avatar, swapped for the favicon only once it loads. Google's "no favicon"
// placeholder is a ~16px globe, so reject anything that small to avoid the blurry globe. When the
// primary favicon 404s or is too small (some dashboard subdomains have none), fall back to the
// registrable domain's icon before settling on the initial. A custom Tabler icon + bg overrides
// the favicon path entirely.
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
  const Tabler = resolveTablerIcon(iconName);
  const fallback = faviconRootFallback(src);
  const key = `${src ?? ''}|${fallback ?? ''}`;
  const [resolved, setResolved] = useState<{ key: string; src: string | null }>({
    key: '',
    src: null,
  });

  useEffect(() => {
    if (Tabler) return;
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
        if (img.naturalWidth > 16) setResolved({ key, src: candidates[i] });
        else tryAt(i + 1);
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
  }, [Tabler, key, src, fallback]);

  const favicon = !Tabler && resolved.key === key ? resolved.src : null;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const bg = iconBg || DEFAULT_ICON_BG;
  const fg = iconFgForBg(bg);

  if (Tabler) {
    return (
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 select-none"
        style={{ width: size, height: size, backgroundColor: bg, color: fg }}
      >
        <Tabler size={Math.max(10, Math.round(size * 0.62))} stroke={1.75} />
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
