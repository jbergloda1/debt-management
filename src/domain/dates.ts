import type { ISODate, WeekendShift, YearMonth } from './types';

// Ngày thuần (P4): tính trên (năm, tháng, ngày) nguyên, không dùng giờ địa phương.

const pad = (n: number) => String(n).padStart(2, '0');

export function parseDate(d: ISODate): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number);
  return [y, m, day];
}

export function parseYM(ym: YearMonth): [number, number] {
  const [y, m] = ym.split('-').map(Number);
  return [y, m];
}

export const toISO = (y: number, m: number, d: number): ISODate => `${y}-${pad(m)}-${pad(d)}`;
export const toYM = (y: number, m: number): YearMonth => `${y}-${pad(m)}`;
export const monthOf = (d: ISODate): YearMonth => d.slice(0, 7);
export const dayOf = (d: ISODate) => parseDate(d)[2];

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const startOfMonth = (ym: YearMonth): ISODate => `${ym}-01`;

export function endOfMonth(ym: YearMonth): ISODate {
  const [y, m] = parseYM(ym);
  return toISO(y, m, daysInMonth(y, m));
}

/** Ngày `day` của tháng ym, kẹp về cuối tháng nếu tràn (31/02 → 28/02). */
export function setDay(ym: YearMonth, day: number): ISODate {
  const [y, m] = parseYM(ym);
  return toISO(y, m, Math.max(1, Math.min(day, daysInMonth(y, m))));
}

export function addMonthsYM(ym: YearMonth, n: number): YearMonth {
  const [y, m] = parseYM(ym);
  const total = y * 12 + (m - 1) + n;
  return toYM(Math.floor(total / 12), (((total % 12) + 12) % 12) + 1);
}

/** Như EDATE của Excel. */
export const addMonths = (d: ISODate, n: number): ISODate => setDay(addMonthsYM(monthOf(d), n), dayOf(d));

export function monthsBetween(fromYM: YearMonth, toYM_: YearMonth): number {
  const [fy, fm] = parseYM(fromYM);
  const [ty, tm] = parseYM(toYM_);
  return (ty - fy) * 12 + (tm - fm);
}

const toDayNumber = (d: ISODate) => {
  const [y, m, day] = parseDate(d);
  return Date.UTC(y, m - 1, day) / 86_400_000;
};

const fromDayNumber = (n: number): ISODate => {
  const dt = new Date(n * 86_400_000);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

export const addDays = (d: ISODate, n: number): ISODate => fromDayNumber(toDayNumber(d) + n);

/** Số ngày từ today đến d (âm nếu đã qua). */
export const daysUntil = (d: ISODate, today: ISODate) => Math.round(toDayNumber(d) - toDayNumber(today));

/** 0 = Chủ nhật … 6 = Thứ bảy */
export const dayOfWeek = (d: ISODate) => new Date(toDayNumber(d) * 86_400_000).getUTCDay();

export function isBusinessDay(d: ISODate, holidays: ISODate[] = []): boolean {
  const w = dayOfWeek(d);
  return w !== 0 && w !== 6 && !holidays.includes(d);
}

export function shiftBusinessDay(d: ISODate, mode: WeekendShift, holidays: ISODate[] = []): ISODate {
  if (mode === 'none') return d;
  const step = mode === 'next_business_day' ? 1 : -1;
  let x = d;
  for (let i = 0; i < 14 && !isBusinessDay(x, holidays); i++) x = addDays(x, step);
  return x;
}

export const inMonth = (d: ISODate, ym: YearMonth) => monthOf(d) === ym;

export const monthRange = (from: YearMonth, count: number): YearMonth[] =>
  Array.from({ length: Math.max(0, count) }, (_, i) => addMonthsYM(from, i));

export const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);

export function todayISO(): ISODate {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function formatDate(d: ISODate | undefined, locale = 'vi-VN'): string {
  if (!d) return '—';
  const [y, m, day] = parseDate(d);
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, day)),
  );
}

/** Ghép các phần số theo thứ tự của locale, ngăn cách bằng '/' (vi: 05/11, en-US: 11/05). */
function numericParts(locale: string, date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' })
    .formatToParts(date)
    .filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year')
    .map((p) => p.value)
    .join('/');
}

export function formatShortDate(d: ISODate | undefined, locale = 'vi-VN'): string {
  if (!d) return '—';
  const [y, m, day] = parseDate(d);
  return numericParts(locale, new Date(Date.UTC(y, m - 1, day)), { day: '2-digit', month: '2-digit' });
}

/** '2026-11' → '11/2026' */
export function formatYM(ym: YearMonth, locale = 'vi-VN'): string {
  const [y, m] = parseYM(ym);
  return numericParts(locale, new Date(Date.UTC(y, m - 1, 1)), { month: '2-digit', year: 'numeric' });
}
