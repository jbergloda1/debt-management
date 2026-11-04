import { endOfMonth, inMonth, maxDate, monthOf, setDay, startOfMonth } from './dates';
import { outstandingOf } from './dueItems';
import type { Engine } from './engine';
import { sumBy } from './money';
import type { DueItem, IncomeEntry, ISODate, Money, YearMonth } from './types';

export interface IncomeOccurrence {
  incomeId: string;
  name: string;
  date: ISODate;
  amount: Money;
}

export function incomeOccurrences(incomes: IncomeEntry[], month: YearMonth): IncomeOccurrence[] {
  const out: IncomeOccurrence[] = [];
  for (const inc of incomes) {
    const r = inc.recurrence;
    if (r.type === 'once') {
      if (inMonth(r.date, month)) out.push({ incomeId: inc.id, name: inc.name, date: r.date, amount: inc.amount });
    } else if ((!r.from || month >= r.from) && (!r.to || month <= r.to)) {
      out.push({ incomeId: inc.id, name: inc.name, date: setDay(month, r.day), amount: inc.amount });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface TimelineEvent {
  date: ISODate;
  label: string;
  delta: Money;
  balance: Money;
}

export type CashVerdict = 'enough' | 'short' | 'short_temporarily' | 'unknown';

export interface CashCheck {
  /** Số dư các tài khoản + thu nhập còn sẽ nhận trong tháng */
  available: Money;
  balances: Money;
  incomeExpected: Money;
  leftover: Money;
  verdict: CashVerdict;
  shortBy?: Money;
  shortDate?: ISODate;
  timeline: TimelineEvent[];
}

/**
 * Mục 13. Tháng chứa hôm nay: chỉ tính thu nhập từ hôm nay trở đi (phần trước coi như đã nằm trong số dư).
 * Tháng tương lai: số dư hiện tại + toàn bộ thu nhập của tháng đó. Tháng quá khứ: chỉ số dư.
 */
export function cashCheck(engine: Engine, month: YearMonth, items: DueItem[]): CashCheck {
  const { state, today } = engine;
  const balances = sumBy(state.cashAccounts, (a) => a.balance);
  const todayMonth = monthOf(today);
  const start = month === todayMonth ? today : startOfMonth(month);
  const incomes = month < todayMonth ? [] : incomeOccurrences(state.incomes, month).filter((i) => i.date >= start);
  const incomeExpected = sumBy(incomes, (i) => i.amount);
  const unpaid = items.filter((it) => !it.includedIn && outstandingOf(it) > 0);
  const outflow = sumBy(unpaid, outstandingOf);
  const available = balances + incomeExpected;
  const leftover = available - outflow;

  // Timeline theo ngày: thu trước, chi sau trong cùng một ngày
  const events = [
    ...incomes.map((i) => ({ date: i.date, label: i.name, delta: i.amount, order: 0 })),
    ...unpaid.map((it) => ({
      date: maxDate(it.dueDate, start),
      label: `${engine.obligation(it.obligationId)?.name ?? ''} · ${it.label}`,
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
    return { date: e.date, label: e.label, delta: e.delta, balance };
  });

  const known = state.cashAccounts.length > 0 || state.incomes.length > 0;
  const verdict: CashVerdict = !known
    ? 'unknown'
    : leftover < 0
      ? 'short'
      : month >= todayMonth && minBalance < 0
        ? 'short_temporarily'
        : 'enough';

  return {
    available,
    balances,
    incomeExpected,
    leftover,
    verdict,
    shortBy: leftover < 0 ? -leftover : verdict === 'short_temporarily' ? -minBalance : undefined,
    shortDate: verdict === 'enough' ? undefined : shortDate,
    timeline,
  };
}
