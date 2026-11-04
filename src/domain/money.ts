import type { Money, RoundingPolicy } from './types';

export const DEFAULT_ROUNDING: RoundingPolicy = { mode: 'round', unit: 1, remainderTo: 'last' };

/** Làm tròn số thực về Money theo policy (unit = 1, 1000, ...). */
export function roundMoney(x: number, policy: RoundingPolicy = DEFAULT_ROUNDING): Money {
  const unit = policy.unit > 0 ? policy.unit : 1;
  const q = x / unit;
  const r = policy.mode === 'floor' ? Math.floor(q) : policy.mode === 'ceil' ? Math.ceil(q) : Math.round(q);
  return r * unit;
}

/** Chia đều total thành n phần nguyên; phần lẻ dồn vào kỳ cuối/đầu để tổng đúng bằng total. */
export function splitEven(total: Money, n: number, policy: RoundingPolicy = DEFAULT_ROUNDING): Money[] {
  if (n <= 0) return [];
  let base = roundMoney(total / n, policy);
  // Làm tròn lên có thể khiến phần dồn bị âm (gốc nhỏ, nhiều kỳ) → dùng làm tròn xuống
  if (base * (n - 1) > total) base = roundMoney(total / n, { ...policy, mode: 'floor' });
  const parts = Array<Money>(n).fill(base);
  const rest = total - base * (n - 1);
  parts[policy.remainderTo === 'first' ? 0 : n - 1] = rest;
  return parts;
}

export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
export const sumBy = <T>(xs: T[], f: (x: T, i: number) => number) => xs.reduce((s, x, i) => s + f(x, i), 0);

/** Số chữ số thập phân của tiền tệ (VND = 0, USD = 2). */
export function minorUnitDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  } catch {
    return 0;
  }
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: Money, currency: string, locale: string): string {
  const key = `${locale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency });
    formatters.set(key, f);
  }
  return f.format(amount / 10 ** minorUnitDigits(currency));
}

export function formatRate(r: number, locale = 'vi-VN', digits = 1): string {
  if (!Number.isFinite(r)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(r);
}
