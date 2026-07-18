// Favicon via Google s2 (same approach as Remnawave's favicon-resolver).
const S2_PREFIX = 'https://www.google.com/s2/favicons?sz=64&domain_url=';

function faviconResolver(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link.startsWith('http') ? link : `https://${link}`);
    if (!url.host) return null;
    return `${S2_PREFIX}${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Favicon for the registrable domain, dropping one subdomain label (console.yandex.cloud →
 * yandex.cloud). Google's s2 service 404s for some dashboard subdomains (e.g. console.yandex.cloud)
 * while it has the root domain's icon, so this is tried as a fallback when the primary fails to
 * load. Returns null when `src` isn't an s2 URL or the host has no subdomain to strip.
 */
export function faviconRootFallback(src: string | null): string | null {
  if (!src?.startsWith(S2_PREFIX)) return null;
  try {
    const url = new URL(src.slice(S2_PREFIX.length));
    const labels = url.host.split('.');
    if (labels.length < 3) return null;
    return `${S2_PREFIX}${url.protocol}//${labels.slice(1).join('.')}`;
  } catch {
    return null;
  }
}

/** Resolve a provider's favicon from its login URL (the provider's dashboard link). */
export function providerFavicon(p: {
  faviconLink: string | null;
  loginUrl: string | null;
}): string | null {
  return faviconResolver(p.faviconLink || p.loginUrl);
}

/**
 * A project's icon. A direct image URL (has a path, e.g. .../logo.png) is used as-is; a bare domain
 * is resolved to its site favicon (Google s2), like providers.
 */
export function projectFavicon(faviconLink: string | null): string | null {
  if (!faviconLink) return null;
  try {
    const url = new URL(faviconLink.startsWith('http') ? faviconLink : `https://${faviconLink}`);
    if (url.pathname && url.pathname !== '/') return url.href;
    return faviconResolver(faviconLink);
  } catch {
    return null;
  }
}
