import { IconEye, IconEyeOff, IconLoader2 } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const MASK = '••••••••';
const AUTO_HIDE_MS = 45_000;

export interface SecretInputProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange'> {
  value?: string;
  onChange?: (value: string) => void;
  hasStored?: boolean;
  onReveal?: () => Promise<string>;
  multiline?: boolean;
}

export function SecretInput({
  className,
  value = '',
  onChange,
  hasStored = false,
  onReveal,
  multiline = false,
  disabled,
  id,
  placeholder,
  ...rest
}: SecretInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fixed-length mask whenever a stored secret is hidden (never mirror real length).
  const showMask = Boolean(hasStored && !visible);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  };

  const toggle = async () => {
    if (showMask) {
      if (!value) {
        if (!onReveal || revealing) return;
        setRevealing(true);
        try {
          const secret = await onReveal();
          onChange?.(secret);
          setVisible(true);
          scheduleHide();
        } finally {
          setRevealing(false);
        }
        return;
      }
      setVisible(true);
      scheduleHide();
      return;
    }
    setVisible((v) => {
      const next = !v;
      if (next) scheduleHide();
      else if (hideTimer.current) clearTimeout(hideTimer.current);
      return next;
    });
  };

  const eye = (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled || revealing || (showMask && !value && !onReveal)}
      aria-label={visible ? 'hide secret' : 'show secret'}
      className={cn(
        'absolute right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50',
        multiline && value && visible ? 'top-0 h-9' : 'inset-y-0',
      )}
      onClick={() => void toggle()}
    >
      {revealing ? (
        <IconLoader2 className="size-4 animate-spin" />
      ) : visible ? (
        <IconEyeOff className="size-4" />
      ) : (
        <IconEye className="size-4" />
      )}
    </button>
  );

  if (multiline && value && visible) {
    return (
      <div className="relative">
        <Textarea
          id={inputId}
          rows={7}
          wrap="off"
          spellCheck={false}
          className={cn(
            'overflow-x-auto pr-9 font-mono text-xs whitespace-pre [field-sizing:fixed]',
            className,
          )}
          value={value}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => onChange?.(e.target.value)}
        />
        {eye}
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={inputId}
        type={showMask ? 'text' : visible ? 'text' : 'password'}
        className={cn('pr-9', multiline && 'font-mono text-xs', className)}
        value={showMask ? MASK : value}
        readOnly={showMask}
        disabled={disabled}
        placeholder={showMask ? undefined : placeholder}
        autoComplete="off"
        onChange={showMask ? undefined : (e) => onChange?.(e.target.value)}
        {...rest}
      />
      {eye}
    </div>
  );
}
