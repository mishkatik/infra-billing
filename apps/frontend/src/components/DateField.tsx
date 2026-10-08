import { IconCalendar, IconX } from '@tabler/icons-react';
import { enUS, ru } from 'date-fns/locale';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Strict parsing against a list of formats (dayjs(text, formats, true)) requires this plugin.
dayjs.extend(customParseFormat);

const DISPLAY_FORMAT = 'DD.MM.YYYY';
const ISO_FORMAT = 'YYYY-MM-DD';
const INPUT_FORMATS = [DISPLAY_FORMAT, 'D.M.YYYY', ISO_FORMAT];

/** ISO value → input text (DD.MM.YYYY); invalid/empty → empty string. */
function toDisplay(value: string): string {
  if (!value) return '';
  const parsed = dayjs(value, ISO_FORMAT, true);
  return parsed.isValid() ? parsed.format(DISPLAY_FORMAT) : '';
}

interface DateFieldProps {
  /** Value in 'YYYY-MM-DD' format, or an empty string. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
}

/**
 * Date field: free-text input (DD.MM.YYYY, parsed on blur/Enter) plus a calendar in a Popover.
 * Always emits a YYYY-MM-DD string or ''.
 */
export function DateField({
  value,
  onChange,
  placeholder,
  disabled,
  clearable = true,
  id,
  className,
}: DateFieldProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => toDisplay(value));
  // Never rendered — a ref avoids a re-render on every focus/blur.
  const focusedRef = useRef(false);

  // External value changes (form reset, calendar pick) re-sync the text, but must not clobber
  // it while the user is typing. Render-time prev-comparison instead of an effect: the reset
  // happens in the same render pass, without an intermediate frame showing stale text.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!focusedRef.current) setText(toDisplay(value));
  }

  const parsedValue = value ? dayjs(value, ISO_FORMAT, true) : null;
  const selected = parsedValue?.isValid() ? parsedValue.toDate() : undefined;
  const showClear = Boolean(clearable && value && !disabled);

  /** Parses the typed text: valid → onChange(ISO), empty → onChange(''), otherwise revert the text. */
  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setText('');
      if (value !== '') onChange('');
      return;
    }
    const parsed = dayjs(trimmed, INPUT_FORMATS, true);
    if (parsed.isValid()) {
      setText(parsed.format(DISPLAY_FORMAT));
      const iso = parsed.format(ISO_FORMAT);
      if (iso !== value) onChange(iso);
    } else {
      setText(toDisplay(value));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <Input
          id={id}
          value={text}
          placeholder={placeholder ?? DISPLAY_FORMAT}
          disabled={disabled}
          autoComplete="off"
          className={cn('pr-9', showClear && 'pr-[3.75rem]')}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            commit();
            focusedRef.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Keep Enter from submitting the form with raw text — commit the date first.
              e.preventDefault();
              commit();
            }
          }}
        />
        {showClear && (
          <button
            type="button"
            aria-label="clear"
            className="absolute inset-y-0 right-9 flex w-6 items-center justify-center text-ink-3 transition-colors hover:text-foreground"
            onClick={() => {
              setText('');
              onChange('');
            }}
          >
            <IconX className="size-3.5" />
          </button>
        )}
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="calendar"
            disabled={disabled}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-3 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <IconCalendar className="size-4" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          locale={i18n.resolvedLanguage === 'ru' ? ru : enUS}
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) {
              onChange(dayjs(d).format(ISO_FORMAT));
              setText(dayjs(d).format(DISPLAY_FORMAT));
            } else {
              onChange('');
              setText('');
            }
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
