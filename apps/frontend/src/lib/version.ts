const NUMERIC = /^\d+(\.\d+)*$/;

/** Numeric parts of a bare version ("0.41.0"); a leading "v" and any -pre/+build suffix are dropped. */
function parts(version: string): number[] | null {
  const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0];
  return NUMERIC.test(core) ? core.split('.').map(Number) : null;
}

/**
 * Dot-part numeric compare: <0 if a<b, 0 if equal, >0 if a>b.
 * Null when either side isn't numeric (e.g. "dev") — callers must not read that as "newer".
 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** True only when both are numeric and `candidate` is strictly newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const c = compareVersions(candidate, current);
  return c != null && c > 0;
}
