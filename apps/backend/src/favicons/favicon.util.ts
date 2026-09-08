// Favicon source resolution. Kept free of Nest imports so the compiled module can be required
// from the plain node tests.

const S2_PREFIX = 'https://www.google.com/s2/favicons?sz=64&domain_url=';

export interface FaviconCandidate {
  url: string;
  /** Google s2 answers "no favicon" with a 16px globe; the fetcher rejects tiny images from it. */
  service: boolean;
}

export interface FaviconSource {
  faviconLink: string | null;
  loginUrl: string | null;
}

/** http(s) URL or null. Scheme-less input ("my.panel.tld") is treated as https. */
function parseHttpUrl(raw: string | null | undefined): URL | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

function hasPath(url: URL): boolean {
  return url.pathname !== '' && url.pathname !== '/';
}

function s2(url: URL): FaviconCandidate {
  return { url: `${S2_PREFIX}${url.protocol}//${url.host}`, service: true };
}

/**
 * s2 for the registrable domain, one label up (console.yandex.cloud → yandex.cloud): Google
 * 404s on some dashboard subdomains while it has the root domain's icon.
 */
function s2Root(url: URL): FaviconCandidate | null {
  const labels = url.hostname.split('.');
  if (labels.length < 3) return null;
  return { url: `${S2_PREFIX}${url.protocol}//${labels.slice(1).join('.')}`, service: true };
}

/**
 * Ordered fetch candidates for an entity: a direct image link (a stored faviconLink with a real
 * path, e.g. a BILLmanager skin icon) first, then Google s2 for the bare-domain link, the login
 * URL and finally the direct link's own host, each followed by its root-domain fallback.
 */
export function buildFaviconCandidates(src: FaviconSource): FaviconCandidate[] {
  const out: FaviconCandidate[] = [];
  const push = (c: FaviconCandidate | null) => {
    if (c && !out.some((o) => o.url === c.url)) out.push(c);
  };

  const hosts: URL[] = [];
  const link = parseHttpUrl(src.faviconLink);
  if (link) {
    if (hasPath(link)) push({ url: link.href, service: false });
    else hosts.push(link);
  }
  const login = parseHttpUrl(src.loginUrl);
  if (login) hosts.push(login);
  if (link && hasPath(link)) hosts.push(link);

  for (const host of hosts) {
    push(s2(host));
    push(s2Root(host));
  }
  return out;
}

/**
 * Drops <foreignObject> subtrees from an SVG. Browsers don't render them when the SVG is used as
 * an image (design-tool exports put blurred backgrounds there), and Chrome marks any canvas such
 * an SVG is drawn on as tainted, which would defeat the frontend's tone analysis.
 */
export function stripForeignObjects(svg: string): string {
  return svg.replace(/<foreignObject\b[^>]*\/>|<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '');
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Width from the IHDR chunk, or null when the bytes are not a PNG. */
export function pngWidth(buf: Buffer): number | null {
  if (buf.length < 24) return null;
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return buf.readUInt32BE(16);
}
