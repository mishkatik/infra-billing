import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Password field with a visibility toggle. */
export function PasswordInput({ className, ...props }: React.ComponentProps<'input'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-9', className)} {...props} />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? 'hide password' : 'show password'}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-3 transition-colors hover:text-foreground"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
      </button>
    </div>
  );
}
