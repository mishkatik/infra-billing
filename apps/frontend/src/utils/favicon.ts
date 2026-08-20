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

/** True for s2 URLs — the service answers "no favicon" with a 16px globe callers filter out. */
export function isFaviconServiceUrl(src: string): boolean {
  return src.startsWith(S2_PREFIX);
}

/**
 * A direct image URL (has a path, e.g. .../logo.png) is used as-is; a bare domain is resolved
 * to its site favicon (Google s2).
 */
function faviconFromLink(link: string): string | null {
  try {
    const url = new URL(link.startsWith('http') ? link : `https://${link}`);
    if (url.pathname && url.pathname !== '/') return url.href;
    return faviconResolver(link);
  } catch {
    return null;
  }
}

/**
 * A provider's icon. faviconLink (when the sync resolved one from the panel itself, e.g. a
 * BILLmanager skin icon) wins over the loginUrl-derived site favicon.
 */
export function providerFavicon(p: {
  faviconLink: string | null;
  loginUrl: string | null;
}): string | null {
  return p.faviconLink ? faviconFromLink(p.faviconLink) : faviconResolver(p.loginUrl);
}

/** A project's icon. */
export function projectFavicon(faviconLink: string | null): string | null {
  return faviconLink ? faviconFromLink(faviconLink) : null;
}
