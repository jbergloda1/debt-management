import { endOfMonth, inMonth, maxDate, monthOf, setDay, startOfMonth } from './dates';
import { outstandingOf } from './dueItems';
import type { Engine } from './engine';
import { sumBy } from './money';
import type { DueItem, ExpenseCategory, ExpenseEntry, IncomeEntry, IncomeRecurrence, ISODate, Money, YearMonth } from './types';

/** Ngày phát sinh trong tháng của một khoản thu/chi (một lần hoặc hàng tháng). */
function occursOn(r: IncomeRecurrence, month: YearMonth): ISODate | undefined {
  if (r.type === 'once') return inMonth(r.date, month) ? r.date : undefined;
  if ((r.from && month < r.from) || (r.to && month > r.to)) return undefined;
  return setDay(month, r.day);
}

export interface IncomeOccurrence {
  incomeId: string;
  name: string;
  date: ISODate;
  amount: Money;
}

export function incomeOccurrences(incomes: IncomeEntry[], month: YearMonth): IncomeOccurrence[] {
  return incomes
    .flatMap((inc) => {
      const date = occursOn(inc.recurrence, month);
      return date ? [{ incomeId: inc.id, name: inc.name, date, amount: inc.amount }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface ExpenseOccurrence {
  expenseId: string;
  name: string;
  category: ExpenseCategory;
  date: ISODate;
  amount: Money;
}

export function expenseOccurrences(expenses: ExpenseEntry[], month: YearMonth): ExpenseOccurrence[] {
  return expenses
    .flatMap((e) => {
      const date = occursOn(e.recurrence, month);
      return date ? [{ expenseId: e.id, name: e.name, category: e.category, date, amount: e.amount }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface TimelineEvent {
  date: ISODate;
  label: string;
  kind: 'income' | 'expense' | 'debt';
  delta: Money;
  balance: Money;
}

export type CashVerdict = 'enough' | 'short' | 'short_temporarily' | 'unknown';

export interface CashCheck {
  /** Số dư các tài khoản + thu nhập còn sẽ nhận trong tháng */
  available: Money;
  balances: Money;
  incomeExpected: Money;
  /** Chi tiêu còn sẽ phát sinh trong tháng */
  expensesExpected: Money;
  /** Tiền trả nợ còn lại trong tháng */
  debtOutflow: Money;
  /** = available − debtOutflow − expensesExpected */
  leftover: Money;
  verdict: CashVerdict;
  shortBy?: Money;
  shortDate?: ISODate;
  timeline: TimelineEvent[];
}

/**
 * Mục 13. Tháng chứa hôm nay: chỉ tính thu nhập và chi tiêu từ hôm nay trở đi (phần trước coi như đã
 * nằm trong số dư). Tháng tương lai: số dư hiện tại + toàn bộ thu/chi của tháng đó. Tháng quá khứ: chỉ số dư.
 */
export function cashCheck(engine: Engine, month: YearMonth, items: DueItem[]): CashCheck {
  const { state, today } = engine;
  const balances = sumBy(state.cashAccounts, (a) => a.balance);
  const todayMonth = monthOf(today);
  const start = month === todayMonth ? today : startOfMonth(month);
  const future = month >= todayMonth;
  const incomes = future ? incomeOccurrences(state.incomes, month).filter((i) => i.date >= start) : [];
  const expenses = future ? expenseOccurrences(state.expenses, month).filter((e) => e.date >= start) : [];
  const incomeExpected = sumBy(incomes, (i) => i.amount);
  const expensesExpected = sumBy(expenses, (e) => e.amount);
  const unpaid = items.filter((it) => !it.includedIn && outstandingOf(it) > 0);
  const debtOutflow = sumBy(unpaid, outstandingOf);
  const available = balances + incomeExpected;
  const leftover = available - debtOutflow - expensesExpected;

  // Timeline theo ngày: trong cùng một ngày, tiền về trước rồi mới chi
  const events = [
    ...incomes.map((i) => ({ date: i.date, label: i.name, kind: 'income' as const, delta: i.amount, order: 0 })),
    ...expenses.map((e) => ({ date: e.date, label: e.name, kind: 'expense' as const, delta: -e.amount, order: 1 })),
    ...unpaid.map((it) => ({
      date: maxDate(it.dueDate, start),
      label: `${engine.obligation(it.obligationId)?.name ?? ''} · ${it.label}`,
      kind: 'debt' as const,
      delta: -outstandingOf(it),
      order: 1,
    })),
  ]
    .filter((e) => e.date <= endOfMonth(month) || e.delta < 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  let balance = balances;
  let minBalance = balance;
  let shortDate: ISODate | undefined;
  const timeline: TimelineEvent[] = events.map((e) => {
    balance += e.delta;
    if (balance < minBalance) minBalance = balance;
    if (balance < 0 && !shortDate) shortDate = e.date;
    return { date: e.date, label: e.label, kind: e.kind, delta: e.delta, balance };
  });

  const known = state.cashAccounts.length > 0 || state.incomes.length > 0;
  const verdict: CashVerdict = !known ? 'unknown' : leftover < 0 ? 'short' : future && minBalance < 0 ? 'short_temporarily' : 'enough';

  return {
    available,
    balances,
    incomeExpected,
    expensesExpected,
    debtOutflow,
    leftover,
    verdict,
    shortBy: leftover < 0 ? -leftover : verdict === 'short_temporarily' ? -minBalance : undefined,
    shortDate: verdict === 'enough' ? undefined : shortDate,
    timeline,
  };
}
