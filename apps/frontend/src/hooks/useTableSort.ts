import { useCallback, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/** What a column accessor yields; null means "no value" → always sorted last. */
export type SortValue = string | number | null;

function readStored<K extends string>(storageKey: string, keys: readonly K[]): SortState<K> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { key, dir } = parsed as { key?: unknown; dir?: unknown };
    if (!keys.includes(key as K)) return null;
    if (dir !== 'asc' && dir !== 'desc') return null;
    return { key: key as K, dir };
  } catch {
    return null;
  }
}

/**
 * Tri-state per-table column sort: asc → desc → off (original API order).
 * Persisted in localStorage under `storageKey`; stale/corrupt values (e.g. a
 * column removed later) fall back to "off". `resetSort` is the "off" state for
 * a page-level reset button.
 */
export function useTableSort<K extends string>(storageKey: string, keys: readonly K[]) {
  const [sort, setSort] = useState<SortState<K> | null>(() => readStored(storageKey, keys));

  const toggleSort = useCallback(
    (key: K) => {
      setSort((prev) => {
        const next: SortState<K> | null =
          prev?.key !== key
            ? { key, dir: 'asc' }
            : prev.dir === 'asc'
              ? { key, dir: 'desc' }
              : null;
        if (next) localStorage.setItem(storageKey, JSON.stringify(next));
        else localStorage.removeItem(storageKey);
        return next;
      });
    },
    [storageKey],
  );

  const resetSort = useCallback(() => {
    localStorage.removeItem(storageKey);
    setSort(null);
  }, [storageKey]);

  return { sort, toggleSort, resetSort };
}

/**
 * Sort rows by the active column's accessor value. Nulls go last regardless of
 * direction; ties keep the API order (Array.prototype.sort is stable).
 */
export function sortRows<T, K extends string>(
  rows: T[] | undefined,
  sort: SortState<K> | null,
  accessors: Record<K, (row: T) => SortValue>,
  locale: string,
): T[] | undefined {
  if (!rows || !sort) return rows;
  const accessor = accessors[sort.key];
  const mul = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((rowA, rowB) => {
    const a = accessor(rowA);
    const b = accessor(rowB);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const cmp =
      typeof a === 'string' && typeof b === 'string'
        ? // numeric: natural order for numbered infra names (vps-2 before vps-10)
          a.localeCompare(b, locale, { numeric: true })
        : Number(a) - Number(b);
    return mul * cmp;
  });
}
