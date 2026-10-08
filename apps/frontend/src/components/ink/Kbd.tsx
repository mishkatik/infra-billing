import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 items-center rounded-sm px-1 text-[11px] leading-none text-ink-3',
        className,
      )}
      {...props}
    />
  );
}
