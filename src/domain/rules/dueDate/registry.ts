import { shiftBusinessDay } from '../../dates';
import type { DueDateRule, ISODate, WeekendShift } from '../../types';

export type RuleOf<T extends DueDateRule['type']> = Extract<DueDateRule, { type: T }>;

export interface DueDateContext {
  startDate: ISODate;
}

export interface DueDateStrategy<R extends DueDateRule = DueDateRule> {
  label: string;
  firstDueDate(rule: R, startDate: ISODate): ISODate;
  /** n bắt đầu từ 1 */
  nthDueDate(rule: R, first: ISODate, n: number, ctx: DueDateContext): ISODate;
  /** Giới hạn số kỳ (ví dụ lịch nhập tay) */
  maxPeriods?(rule: R): number;
  describe(rule: R): string;
}

const registry = new Map<string, DueDateStrategy<any>>();

export function registerDueDateStrategy<T extends DueDateRule['type']>(type: T, s: DueDateStrategy<RuleOf<T>>) {
  registry.set(type, s);
}

export function getDueDateStrategy(type: string): DueDateStrategy {
  const s = registry.get(type);
  if (!s) throw new Error(`Chưa đăng ký quy tắc ngày: ${type}`);
  return s;
}

export const listDueDateStrategies = () => [...registry.entries()].map(([type, s]) => ({ type, label: s.label }));

export interface ShiftOptions {
  weekendShift: WeekendShift;
  holidays: ISODate[];
}

/** Sinh `count` ngày đến hạn theo rule, đã áp dời ngày nghỉ. */
export function generateDueDates(rule: DueDateRule, startDate: ISODate, count: number, shift?: ShiftOptions): ISODate[] {
  const s = getDueDateStrategy(rule.type);
  const n = Math.min(count, s.maxPeriods?.(rule) ?? count);
  if (n <= 0) return [];
  const first = s.firstDueDate(rule, startDate);
  const dates: ISODate[] = [];
  for (let k = 1; k <= n; k++) {
    const raw = k === 1 ? first : s.nthDueDate(rule, first, k, { startDate });
    dates.push(shift ? shiftBusinessDay(raw, shift.weekendShift, shift.holidays) : raw);
  }
  return dates;
}

export const describeDueRule = (rule: DueDateRule) => getDueDateStrategy(rule.type).describe(rule);
