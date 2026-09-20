import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';

function readStored<T>(storageKey: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStored(storageKey: string, value: object) {
  try {
    if (Object.values(value).every((v) => v === undefined)) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Quota exceeded or a privacy mode that blocks storage: the state still works for this visit.
  }
}

/**
 * useState that survives reloads via localStorage under `storageKey`. `parse` validates the stored
 * JSON — whatever it rejects falls back to `fallback`. Writes happen inside the updater, as in
 * useTableSort. `restore` is read once by the lazy initializer: with `false` the state starts from
 * `fallback` without touching storage, but every later change is still written, so the first change
 * on such a visit replaces whatever was stored — storage always mirrors the screen.
 * `T extends object` is what lets the setter tell an updater function from a plain value.
 */
export function usePersistedState<T extends object>(
  storageKey: string,
  parse: (raw: unknown) => T | null,
  fallback: T,
  restore = true,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(
    () => (restore ? readStored(storageKey, parse) : null) ?? fallback,
  );
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (update) => {
      setState((prev) => {
        const next = typeof update === 'function' ? update(prev) : update;
        writeStored(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );
  return [state, set];
}

/**
 * A persisted uuid whose loaded list no longer contains it (the entity was deleted since the value
 * was saved). An undefined list is still loading, so the value is kept.
 */
export function isStaleUuid(uuid: string | undefined, list: { uuid: string }[] | undefined) {
  return !!uuid && !!list && !list.some((x) => x.uuid === uuid);
}
