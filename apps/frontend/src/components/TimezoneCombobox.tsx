import { useTranslation } from 'react-i18next';
import { Combobox } from '@/components/Combobox';
import { QUIET_HOURS_TIMEZONES } from '@/constants';

// Some browsers still report the pre-2022 ids; map them onto the ones in the list.
const LEGACY_IDS: Record<string, string> = {
  'Europe/Kiev': 'Europe/Kyiv',
  'Asia/Calcutta': 'Asia/Kolkata',
};

/** The browser's own zone, as a default for a picker that has nothing saved yet. */
export function browserTimeZone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return LEGACY_IDS[tz] ?? tz;
}

/** Current UTC offset of `timeZone` (DST included): "+03:00", "−05:00". */
function utcOffset(timeZone: string, now: Date): { label: string; minutes: number } {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const [, sign = '+', hh = '00', mm = '00'] = name.match(/^GMT([+-])(\d{2}):(\d{2})$/) ?? [];
  const minutes = (sign === '-' ? -1 : 1) * (Number(hh) * 60 + Number(mm));
  return { label: `${sign === '-' ? '−' : '+'}${hh}:${mm}`, minutes };
}

interface TimezoneComboboxProps {
  /** IANA id. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

/** Time zone picker: "Москва (+03:00)", sorted by the current offset, searchable by IANA id. */
export function TimezoneCombobox({ value, onChange, id }: TimezoneComboboxProps) {
  const { t } = useTranslation();
  const now = new Date();
  // A zone outside the list (set through the API, or the browser's own) still has to show up.
  const ids = QUIET_HOURS_TIMEZONES.includes(value)
    ? QUIET_HOURS_TIMEZONES
    : [...QUIET_HOURS_TIMEZONES, value];
  const options = ids
    .map((tz) => {
      const offset = utcOffset(tz, now);
      const name = t(`timezones.${tz}`, { defaultValue: tz });
      return { value: tz, name, minutes: offset.minutes, label: `${name} (${offset.label})` };
    })
    .sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name))
    .map(({ value, label }) => ({ value, label, keywords: [value] }));

  return <Combobox id={id} value={value} onChange={onChange} options={options} />;
}
