import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Consume /page?selected=<uuid> (dashboard badges deep-link this way): once the
 * list arrives, open the matching row's detail view and drop the param — a
 * refresh after closing the modal must not reopen it.
 */
export function useSelectedParam<T extends { uuid: string }>(
  items: T[] | undefined,
  open: (item: T) => void,
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('selected');
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!selected || !items) return;
    const item = items.find((x) => x.uuid === selected);
    if (item) openRef.current(item);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('selected');
        return next;
      },
      { replace: true },
    );
  }, [selected, items, setSearchParams]);
}
