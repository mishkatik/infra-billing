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
  const alive = useRef(true);
  const valueRef = useRef(value);
  const revealedSnapshot = useRef<string | null>(null);
  valueRef.current = value;

  const showMask = Boolean(hasStored && !visible && !value);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const hide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setVisible(false);
    const snap = revealedSnapshot.current;
    if (hasStored && snap != null && valueRef.current === snap) {
      revealedSnapshot.current = null;
      onChange?.('');
    }
  };

  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hide, AUTO_HIDE_MS);
  };

  const toggle = async () => {
    if (showMask) {
      if (!onReveal || revealing) return;
      setRevealing(true);
      try {
        const secret = await onReveal();
        if (!alive.current) return;
        revealedSnapshot.current = secret;
        onChange?.(secret);
        setVisible(true);
        scheduleHide();
      } catch {
        if (alive.current) setVisible(true);
      } finally {
        if (alive.current) setRevealing(false);
      }
      return;
    }
    if (visible) {
      hide();
      return;
    }
    setVisible(true);
    scheduleHide();
  };

  const eye = (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled || revealing || (showMask && !onReveal)}
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
