import { normalizeCurrency } from '../common/currency';

// BILLmanager renders scalars as { "$": "value" } and sometimes arrays of them.
export function val(x: unknown): string | undefined {
  if (x == null) return undefined;
  if (Array.isArray(x)) return x.length ? val(x[0]) : undefined;
  if (typeof x === 'object') {
    const v = (x as Record<string, unknown>).$;
    return v == null ? undefined : String(v);
  }
  return String(x);
}

export function firstNumber(s: string | undefined): string | undefined {
  return s?.match(/-?\d+(\.\d+)?/)?.[0];
}

export function asArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

// Currency from an amount string like "5.00 $" / "49.99 руб." — strip the number, keep the symbol.
export function currencyFromAmount(s: string | undefined): string {
  return normalizeCurrency((s ?? '').replace(/[\d.,\s+-]/g, ''));
}

// BILLmanager dates are ISO-ish ("2026-06-06"); undefined when missing/unparseable.
export function parseBillmgrDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// BILLmanager error → short human message (msg/detail/$object), not the raw JSON.
export function billmgrError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return (
      val(e.msg) ?? val(e.detail) ?? (e.$object != null ? String(e.$object) : undefined) ?? 'error'
    );
  }
  return String(err);
}
