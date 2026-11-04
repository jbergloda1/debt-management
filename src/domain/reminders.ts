import { addDays, daysUntil, monthOf, monthRange, monthsBetween } from './dates';
import { dueItemsForMonth, outstandingOf } from './dueItems';
import type { Engine } from './engine';
import { formatMoney } from './money';
import type { DueItem, ISODate } from './types';

export interface Reminder {
  /** Duy nhất cho (kỳ phải trả, mốc nhắc) — dùng để không nhắc lại */
  key: string;
  itemKey: string;
  obligationId: string;
  /** Ngày hiện thông báo */
  date: ISODate;
  dueDate: ISODate;
  /** Số ngày trước hạn (0 = đúng ngày, âm = quá hạn) */
  daysBefore: number;
  amount: number;
  title: string;
  body: string;
}

/** Không nhắc lại các mốc đã qua quá số ngày này (ví dụ mở app sau một tuần). */
export const STALE_DAYS = 3;

function describe(engine: Engine, it: DueItem, daysBefore: number, amount: number): Pick<Reminder, 'title' | 'body'> {
  const { currency, locale } = engine.state.profile;
  const name = engine.obligation(it.obligationId)?.name ?? it.label;
  const money = formatMoney(amount, currency, locale);
  const when =
    daysBefore < 0 ? `đã quá hạn ${-daysBefore} ngày` : daysBefore === 0 ? 'đến hạn hôm nay' : `đến hạn sau ${daysBefore} ngày`;
  const [y, m, d] = it.dueDate.split('-');
  return { title: `${name} ${when}`, body: `${it.label} · ${money} · hạn ${d}/${m}/${y}` };
}

/** Các khoản chưa trả có hạn trong [from, until] (đã gồm kỳ quá hạn của tháng hiện tại). */
function openItems(engine: Engine, from: ISODate, until: ISODate): DueItem[] {
  const months = monthRange(monthOf(from), monthsBetween(monthOf(from), monthOf(until)) + 1);
  const seen = new Set<string>();
  return months
    .flatMap((m) => dueItemsForMonth(engine, m))
    .filter((it) => !it.includedIn && outstandingOf(it) > 0 && it.dueDate <= until && !seen.has(it.key) && seen.add(it.key));
}

/**
 * Lịch nhắc từ `from` đến `until` theo settings.reminderDaysBefore (luôn thêm mốc đúng ngày đến hạn).
 * Khoản đã quá hạn được nhắc một lần vào ngày `from`.
 */
export function reminderSchedule(engine: Engine, from: ISODate, until: ISODate): Reminder[] {
  const offsets = [...new Set([...engine.state.profile.settings.reminderDaysBefore, 0])].filter((d) => d >= 0).sort((a, b) => b - a);
  const out: Reminder[] = [];
  for (const it of openItems(engine, addDays(from, -STALE_DAYS), addDays(until, Math.max(...offsets)))) {
    const amount = outstandingOf(it);
    if (it.dueDate < from) {
      const late = daysUntil(it.dueDate, from);
      out.push({ key: `${it.key}@overdue`, itemKey: it.key, obligationId: it.obligationId, date: from, dueDate: it.dueDate, daysBefore: late, amount, ...describe(engine, it, late, amount) });
      continue;
    }
    for (const d of offsets) {
      const date = addDays(it.dueDate, -d);
      if (date > until || date < addDays(from, -STALE_DAYS)) continue;
      out.push({ key: `${it.key}@${d}`, itemKey: it.key, obligationId: it.obligationId, date, dueDate: it.dueDate, daysBefore: d, amount, ...describe(engine, it, d, amount) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.dueDate.localeCompare(b.dueDate));
}

/**
 * Nhắc cần hiện bây giờ: đến ngày, chưa quá cũ, chưa từng hiện, và với mỗi kỳ chỉ lấy mốc gần nhất
 * (mở app muộn thì không hiện dồn cả "trước 5 ngày" lẫn "trước 1 ngày").
 */
export function remindersDue(queue: Reminder[], today: ISODate, shown: Iterable<string>): Reminder[] {
  const done = new Set(shown);
  const latest = new Map<string, Reminder>();
  for (const r of queue) {
    if (r.date > today || r.date < addDays(today, -STALE_DAYS)) continue;
    const cur = latest.get(r.itemKey);
    if (!cur || r.daysBefore < cur.daysBefore) latest.set(r.itemKey, r);
  }
  return [...latest.values()].filter((r) => !done.has(r.key));
}

/** Đánh dấu đã hiện: cả các mốc sớm hơn của cùng kỳ (để không hiện lại khi đã có mốc gần hơn). */
export function markShown(queue: Reminder[], shown: string[], delivered: Reminder[], keep = 500): string[] {
  const keys = new Set(shown);
  for (const r of delivered) {
    for (const q of queue) if (q.itemKey === r.itemKey && q.daysBefore >= r.daysBefore) keys.add(q.key);
    keys.add(r.key);
  }
  return [...keys].slice(-keep);
}
