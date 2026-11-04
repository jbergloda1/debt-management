import { addDays, addMonthsYM, monthOf, monthRange, setDay, startOfMonth } from './dates';
import { dueItemsForMonth, expectedCardDueDate, outstandingOf } from './dueItems';
import type { Engine } from './engine';
import { sumBy } from './money';
import type { DueItem, ID, ISODate, Money, ProfileState, Statement, StatementBased, YearMonth } from './types';

/** Số tháng nhìn lại để tìm khoản chưa trả. */
const LOOKBACK_MONTHS = 3;

/** Tháng đích: tháng hiện tại nếu đang xem tháng cũ hơn, nếu không thì tháng sau tháng đang xem. */
export function defaultTarget(viewMonth: YearMonth, today: ISODate): YearMonth {
  return monthOf(today) > viewMonth ? monthOf(today) : addMonthsYM(viewMonth, 1);
}

export interface BilledLine {
  obligationId: ID;
  label: string;
  amount: Money;
}

export interface CardStatementPlan {
  obligationId: ID;
  name: string;
  /** Sao kê đã nhập có hạn trả trong tháng đích (khi đó không cần nhập nữa) */
  existing?: Statement;
  statementDate: ISODate;
  dueDate: ISODate;
  /** Kỳ trả góp gộp vào sao kê này (để người dùng đối chiếu) */
  billed: BilledLine[];
}

export interface RolloverPlan {
  target: YearMonth;
  /** Khoản chưa trả, hạn trước tháng đích */
  openItems: DueItem[];
  cards: CardStatementPlan[];
}

/** Ngày sao kê & ngày đến hạn dự kiến của kỳ có hạn trả trong tháng `month`. */
export function expectedStatement(ob: StatementBased, month: YearMonth): { statementDate: ISODate; dueDate: ISODate } | undefined {
  const dueDate = expectedCardDueDate(ob, month);
  if (!dueDate) return undefined;
  const r = ob.dueRule;
  let statementDate: ISODate;
  if (r.type === 'statement_fixed_due') {
    statementDate = setDay(addMonthsYM(monthOf(dueDate), r.dueDay > r.statementDay ? 0 : -1), r.statementDay);
  } else if (r.type === 'statement_offset') {
    statementDate = addDays(dueDate, -r.daysAfterStatement);
  } else if (ob.kind === 'credit_card') {
    statementDate = setDay(addMonthsYM(month, -1), ob.statementDay);
  } else {
    statementDate = addDays(dueDate, -25);
  }
  return { statementDate: statementDate > dueDate ? dueDate : statementDate, dueDate };
}

export function planRollover(engine: Engine, target: YearMonth): RolloverPlan {
  const start = startOfMonth(target);
  const seen = new Set<string>();
  const openItems = monthRange(addMonthsYM(target, -LOOKBACK_MONTHS), LOOKBACK_MONTHS)
    .flatMap((m) => dueItemsForMonth(engine, m))
    .filter((it) => !it.includedIn && it.dueDate < start && outstandingOf(it) > 0 && !seen.has(it.key) && seen.add(it.key))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const cards: CardStatementPlan[] = [];
  for (const ob of engine.statementBased()) {
    if (ob.status !== 'active') continue;
    const exp = expectedStatement(ob, target);
    if (!exp) continue;
    const existing = engine.statements(ob.id).find((s) => monthOf(s.dueDate) === target);
    const billed = engine.billedLoans(ob.id).flatMap((l) =>
      engine
        .schedule(l)
        .filter((r) => monthOf(r.dueDate) === monthOf(exp.dueDate))
        .map((r) => ({ obligationId: l.id, label: `${l.name} kỳ ${r.n}/${l.periods}`, amount: r.total })),
    );
    cards.push({ obligationId: ob.id, name: ob.name, existing, ...exp, billed });
  }
  return { target, openItems, cards };
}

export interface RolloverInput {
  target: YearMonth;
  payments: { itemKey: string; obligationId: ID; amount: Money; date: ISODate }[];
  statements: { obligationId: ID; statementDate: ISODate; dueDate: ISODate; statementBalance: Money; currentBalance: Money; minimumDue?: Money }[];
  cash: { id: ID; balance: Money }[];
}

/** Áp kết quả "sang tháng mới" — hàm thuần, trả về state mới (không đổi state cũ). */
export function applyRollover(state: ProfileState, input: RolloverInput, today: ISODate, newId: (prefix: string) => ID): ProfileState {
  const cash = new Map(input.cash.map((c) => [c.id, c.balance]));
  return {
    ...state,
    viewMonth: input.target,
    payments: [
      ...state.payments,
      ...input.payments
        .filter((p) => p.amount > 0)
        .map((p) => ({ id: newId('pay'), obligationId: p.obligationId, dueItemKey: p.itemKey, date: p.date, amount: p.amount, note: 'Sang tháng mới' })),
    ],
    statements: [
      ...state.statements,
      ...input.statements.map((s) => ({ id: newId('st'), ...s, capturedAt: today })),
    ],
    cashAccounts: state.cashAccounts.map((a) =>
      cash.has(a.id) && cash.get(a.id) !== a.balance ? { ...a, balance: cash.get(a.id)!, updatedAt: today } : a,
    ),
  };
}

/** Số tiền mặc định khi đánh dấu đã trả, và ngày trả mặc định (đúng hạn, hoặc hôm nay nếu hạn còn sau). */
export const defaultPayment = (it: DueItem, today: ISODate) => ({
  amount: outstandingOf(it),
  date: it.dueDate <= today ? it.dueDate : today,
});

export const sumOutstanding = (items: DueItem[]) => sumBy(items, outstandingOf);
