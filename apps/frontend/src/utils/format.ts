import dayjs from 'dayjs';

/** Money string → localized (ru) with 2 decimals + optional currency. */
export function formatMoney(value: string | null | undefined, currency?: string | null): string {
  if (value == null) return '—';
  const num = Number(value);
  const formatted = Number.isFinite(num)
    ? num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
  return currency ? `${formatted} ${currency}` : formatted;
}

/** Truncate a money input to 2 decimals ("12.3456" → "12.34"); leaves non-numbers untouched. */
export function trimMoney(value: string): string {
  const m = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!m) return value.trim();
  const [, sign, int, frac] = m;
  return frac ? `${sign}${int}.${frac.slice(0, 2)}` : `${sign}${int}`;
}

/** ISO (UTC) → local datetime. */
export function formatDate(iso: string | null | undefined): string {
  return iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : '—';
}

/** ISO (UTC) → local date. */
export function formatDateShort(iso: string | null | undefined): string {
  return iso ? dayjs(iso).format('DD.MM.YYYY') : '—';
}

/** Country code (ISO 3166-1 alpha-2) → flag emoji. */
export function countryFlag(code: string | null | undefined): string {
  if (code?.length !== 2 || code === 'XX') return '🏳️';
  const base = 0x1f1e6;
  const chars = [...code.toUpperCase()].map((c) => base + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...chars);
}
