// Favicon via Google s2 (same approach as Remnawave's favicon-resolver).
export function faviconResolver(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link.startsWith('http') ? link : `https://${link}`);
    if (!url.host) return null;
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${url.protocol}//${url.host}`;
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
