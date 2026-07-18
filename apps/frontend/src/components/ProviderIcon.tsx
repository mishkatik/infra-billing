import { useEffect, useState } from 'react';
import { faviconRootFallback } from '@/utils/favicon';

// Neutral initial avatar, swapped for the favicon only once it loads. Google's "no favicon"
// placeholder is a ~16px globe, so reject anything that small to avoid the blurry globe. When the
// primary favicon 404s or is too small (some dashboard subdomains have none), fall back to the
// registrable domain's icon before settling on the initial.
export function ProviderIcon({
  name,
  src,
  size = 22,
}: {
  name: string;
  src: string | null;
  size?: number;
}) {
  const fallback = faviconRootFallback(src);
  const key = `${src ?? ''}|${fallback ?? ''}`;
  // Keyed by the candidates it was resolved for: when they change, the favicon below falls back to
  // the initial immediately during render — no reset effect, no flash of the previous icon.
  const [resolved, setResolved] = useState<{ key: string; src: string | null }>({
    key: '',
    src: null,
  });

  useEffect(() => {
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
  }, [key, src, fallback]);

  const favicon = resolved.key === key ? resolved.src : null;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();

  // Favicon and initial share one framed tile, so rows never mix icon footprints
  // (transparent favicons used to render frameless and read as a different size).
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
