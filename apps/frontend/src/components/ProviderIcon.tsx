import { useEffect, useState } from 'react';

// Neutral initial avatar, swapped for the favicon only once it loads. Google's "no favicon"
// placeholder is a ~16px globe, so reject anything that small to avoid the blurry globe.
export function ProviderIcon({
  name,
  src,
  size = 22,
}: {
  name: string;
  src: string | null;
  size?: number;
}) {
  // Keyed by the src it was loaded for: when src changes, the derived favicon below falls back
  // to the initial immediately during render — no reset effect, no flash of the previous icon.
  const [loaded, setLoaded] = useState<{ src: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      setLoaded({ src, ok: img.naturalWidth > 16 });
    };
    img.src = src;
    return () => {
      // A stale onload must not clobber the state that belongs to the current src.
      img.onload = null;
    };
  }, [src]);

  const favicon = loaded && loaded.src === src && loaded.ok ? src : null;
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
