import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CardHeadRowProps {
  title: string;
  count?: number;
  /** Right side: quiet meta text or a small action. */
  children?: ReactNode;
  className?: string;
}

/** Header of a card or table: a calm title with a soft count, meta or an action on the right. */
export function CardHeadRow({ title, count, children, className }: CardHeadRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-14 items-center justify-between gap-3 border-b border-hairline px-6 py-3',
        className,
      )}
    >
      <h2 className="truncate text-[15px] font-medium">
        {title}
        {count != null && <span className="ml-2 font-normal text-ink-3">{count}</span>}
      </h2>
      {children}
    </div>
  );
}
