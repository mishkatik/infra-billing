import { API_PATH, API_PREFIX } from '@infra/shared';

// Favicons come through the backend proxy (same origin, cached): that is what lets ProviderIcon
// read the icon's pixels and pick a contrasting tile. The ?v= hash of the source link is a
// browser-side cache buster — the server drops its entry when the link changes, but the browser
// would keep the old image for the Cache-Control lifetime otherwise.

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// Bump when the proxy starts serving something different for the same source link (e.g. the
// SVG sanitising added in 0.43.1), so browsers drop the day-long cached copy.
const PROXY_REV = 2;

function proxyUrl(path: string, source: string): string {
  return `/${API_PREFIX}${path}?v=${fnv1a(`${PROXY_REV}|${source}`)}`;
}

/** A provider's icon, or null when it has neither a stored favicon link nor a login URL. */
export function providerFavicon(
  p: { uuid: string; faviconLink: string | null; loginUrl: string | null } | null | undefined,
): string | null {
  const source = p?.faviconLink || p?.loginUrl;
  if (!p || !source) return null;
  return proxyUrl(API_PATH.PROVIDERS.FAVICON(p.uuid), source);
}

/** A project's icon, or null when it has no favicon link. */
export function projectFavicon(
  p: { uuid: string; faviconLink: string | null } | null | undefined,
): string | null {
  if (!p?.faviconLink) return null;
  return proxyUrl(API_PATH.PROJECTS.FAVICON(p.uuid), p.faviconLink);
}
