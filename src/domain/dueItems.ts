import { addMonthsYM, daysUntil, endOfMonth, formatShortDate, inMonth, monthOf, setDay, startOfMonth } from './dates';
import type { Engine } from './engine';
import { loanItemKey } from './ledger';
import { sumBy } from './money';
import { generateDueDates, separateFees, upfrontFeesOf } from './rules';
import type { DueItem, DueState, ISODate, Money, StatementBased, YearMonth } from './types';

export function itemState(
  dueDate: ISODate,
  amount: Money,
  paid: Money,
  today: ISODate,
  threshold: number,
  viewMonth: YearMonth,
): DueState {
  if (amount <= 0 || paid >= amount) return 'paid';
  if (paid > 0) return 'partial';
  if (dueDate < today) return 'overdue';
  if (daysUntil(dueDate, today) <= threshold) return 'due_soon';
  if (dueDate > endOfMonth(viewMonth)) return 'not_yet';
  return 'upcoming';
}

/** Ngày đến hạn dự kiến của thẻ trong tháng (khi chưa có sao kê), suy từ dueRule. */
export function expectedCardDueDate(ob: StatementBased, month: YearMonth): ISODate | undefined {
  const start = setDay(addMonthsYM(month, -2), 1);
  return generateDueDates(ob.dueRule, start, 4).find((d) => inMonth(d, month));
}

/**
 * Các DueItem của tháng (mục 10.2). Nếu tháng đang xem chứa hôm nay, các kỳ quá hạn chưa trả của
 * những tháng trước cũng được đưa vào để không bị bỏ sót.
 */
export function dueItemsForMonth(engine: Engine, month: YearMonth): DueItem[] {
  const { state, today } = engine;
  const threshold = state.profile.settings.dueSoonThresholdDays;
  const carryOverdue = monthOf(today) === month;
  const monthStart = startOfMonth(month);
  const items: DueItem[] = [];

  const push = (it: Omit<DueItem, 'state' | 'plannedAmount'>) => {
    const plannedAmount = state.plannedAmounts[it.key];
    items.push({
      ...it,
      plannedAmount,
      state: itemState(it.dueDate, it.amount, it.paidAmount, today, threshold, month),
    });
  };

  for (const ob of engine.open()) {
    if (ob.status === 'paused') continue;

    if (ob.kind === 'installment_loan') {
      const led = engine.ledger(ob);
      const includedIn = ob.link?.billedIntoStatement ? ob.link.parentObligationId : undefined;
      for (const r of engine.schedule(ob)) {
        const st = led.rows[r.n - 1];
        const take = inMonth(r.dueDate, month) || (carryOverdue && r.dueDate < monthStart && !st.paid);
        if (!take) continue;
        push({
          key: loanItemKey(ob.id, r.n),
          obligationId: ob.id,
          institutionId: ob.institutionId,
          kind: 'installment',
          periodIndex: r.n,
          periodsTotal: ob.periods,
          dueDate: r.dueDate,
          breakdown: { principal: r.principal, interest: r.interest, fees: r.fees },
          amount: r.total,
          paidAmount: st.paid ? Math.max(st.paidAmount, r.total) : st.paidAmount,
          includedIn,
          label: `Kỳ ${r.n}/${ob.periods}`,
        });
      }
      const inst = engine.institution(ob.institutionId);
      for (const { fee, amount } of separateFees(upfrontFeesOf(ob, inst), ob.principal, ob.rounding)) {
        const key = `${ob.id}:fee:${fee.id}`;
        const paid = sumBy(engine.payments(ob.id).filter((p) => p.dueItemKey === key), (p) => p.amount);
        if (!(inMonth(ob.startDate, month) || (carryOverdue && ob.startDate < monthStart && paid < amount))) continue;
        push({
          key,
          obligationId: ob.id,
          institutionId: ob.institutionId,
          kind: 'fee',
          dueDate: ob.startDate,
          breakdown: { principal: 0, interest: 0, fees: amount },
          amount,
          paidAmount: paid,
          label: fee.name,
        });
      }
    } else if (ob.kind === 'credit_card' || ob.kind === 'revolving') {
      const list = engine.statements(ob.id);
      const inThisMonth = list.filter((s) => inMonth(s.dueDate, month));
      let st = inThisMonth[inThisMonth.length - 1];
      if (!st && carryOverdue) {
        const latest = list[list.length - 1];
        if (latest && latest.dueDate < monthStart && engine.statementPaid(ob, latest) < engine.statementAmount(ob, latest)) {
          st = latest;
        }
      }
      if (!st) continue;
      const amount = engine.statementAmount(ob, st);
      push({
        key: `${ob.id}:${st.id}`,
        obligationId: ob.id,
        institutionId: ob.institutionId,
        kind: 'card_statement',
        dueDate: st.dueDate,
        breakdown: { principal: amount, interest: 0, fees: 0 },
        amount,
        paidAmount: engine.statementPaid(ob, st),
        label: `Sao kê ${formatShortDate(st.statementDate)}`,
      });
    } else if (ob.kind === 'custom') {
      ob.schedule.forEach((e, i) => {
        const key = loanItemKey(ob.id, i + 1);
        const paid = sumBy(engine.payments(ob.id).filter((p) => p.dueItemKey === key), (p) => p.amount);
        if (!(inMonth(e.dueDate, month) || (carryOverdue && e.dueDate < monthStart && paid < e.amount))) return;
        push({
          key,
          obligationId: ob.id,
          institutionId: ob.institutionId,
          kind: 'custom',
          periodIndex: i + 1,
          periodsTotal: ob.schedule.length,
          dueDate: e.dueDate,
          breakdown: { principal: e.amount, interest: 0, fees: 0 },
          amount: e.amount,
          paidAmount: paid,
          label: e.note || `Lần ${i + 1}/${ob.schedule.length}`,
        });
      });
    }
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const plannedOf = (it: DueItem) => it.plannedAmount ?? it.amount;
export const outstandingOf = (it: DueItem) => (it.state === 'paid' ? 0 : Math.max(0, plannedOf(it) - it.paidAmount));
