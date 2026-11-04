import { cashCheck, type CashCheck } from './cashflow';
import { dueItemsForMonth, expectedCardDueDate, outstandingOf, plannedOf } from './dueItems';
import { createEngine, type Engine } from './engine';
import { sumBy } from './money';
import type { DueItem, DueState, ID, ISODate, Money, ObligationKind, ProfileState, YearMonth } from './types';

export interface SummaryRow {
  key: string;
  obligationId: ID;
  /** Khi gộp theo ngày: các obligation trong nhóm */
  memberIds: ID[];
  label: string;
  institutionId: ID;
  institution: string;
  kind: ObligationKind;
  dueDate?: ISODate;
  amount: Money;
  planned: Money;
  paidAmount: Money;
  state: DueState;
  debtRemaining: Money;
  items: DueItem[];
  /** Kỳ trả góp nằm trong sao kê thẻ (không cộng riêng — P6) */
  children: DueItem[];
}

export interface MonthlySummary {
  month: YearMonth;
  rows: SummaryRow[];
  items: DueItem[];
  totals: {
    payable: Money;
    planned: Money;
    paid: Money;
    unpaid: Money;
    debt: Money;
    dueSoonOrOverdue: number;
  };
  cash: CashCheck;
  byInstitution: Record<ID, { name: string; payable: Money; debt: Money }>;
}

const STATE_PRIORITY: DueState[] = ['overdue', 'partial', 'due_soon', 'upcoming', 'not_yet', 'paid'];

export function aggregateState(items: DueItem[]): DueState {
  if (items.length === 0) return 'not_yet';
  return STATE_PRIORITY.find((s) => items.some((i) => i.state === s)) ?? 'paid';
}

export function monthlySummary(engineOrState: Engine | ProfileState, month: YearMonth, today?: ISODate): MonthlySummary {
  const engine = 'today' in engineOrState ? engineOrState : createEngine(engineOrState, today!);
  const items = dueItemsForMonth(engine, month);
  const rows: SummaryRow[] = [];

  for (const ob of engine.open()) {
    const own = items.filter((i) => i.obligationId === ob.id);
    const inst = engine.institution(ob.institutionId);
    const base = {
      key: ob.id,
      obligationId: ob.id,
      memberIds: [ob.id],
      label: ob.name,
      institutionId: ob.institutionId,
      institution: inst?.name ?? '—',
      kind: ob.kind,
    };

    if (ob.kind === 'installment_loan') {
      if (ob.link?.billedIntoStatement && ob.link.parentObligationId && engine.obligation(ob.link.parentObligationId)) continue;
      const debt = engine.loanDebt(ob);
      if (own.length === 0 && debt <= 0) continue; // đã trả xong
      rows.push({
        ...base,
        ...rowAmounts(own),
        dueDate: firstOpenDate(own) ?? engine.ledger(ob).nextUnpaid?.dueDate,
        debtRemaining: debt,
        items: own,
        children: [],
      });
    } else if (ob.kind === 'credit_card' || ob.kind === 'revolving') {
      const children = items.filter((i) => i.includedIn === ob.id);
      const cycle = engine.cycleMonth(ob, month);
      const unbilled = sumBy(engine.billedLoans(ob.id), (l) => engine.unbilledPrincipal(l, cycle));
      rows.push({
        ...base,
        ...rowAmounts(own),
        dueDate: firstOpenDate(own) ?? expectedCardDueDate(ob, month),
        debtRemaining: engine.cardBalance(ob, month) + unbilled,
        items: own,
        children,
      });
    } else {
      const remaining = sumBy(ob.schedule, (e, i) => {
        const key = `${ob.id}:${i + 1}`;
        const paid = sumBy(engine.payments(ob.id).filter((p) => p.dueItemKey === key), (p) => p.amount);
        return Math.max(0, e.amount - paid);
      });
      if (own.length === 0 && remaining <= 0) continue;
      rows.push({
        ...base,
        ...rowAmounts(own),
        dueDate: firstOpenDate(own) ?? ob.schedule.find((e) => e.dueDate > engine.today)?.dueDate,
        debtRemaining: remaining,
        items: own,
        children: [],
      });
    }
  }

  rows.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  const counted = items.filter((i) => !i.includedIn);
  const byInstitution: MonthlySummary['byInstitution'] = {};
  for (const r of rows) {
    const b = (byInstitution[r.institutionId] ??= { name: r.institution, payable: 0, debt: 0 });
    b.payable += r.amount;
    b.debt += r.debtRemaining;
  }

  return {
    month,
    rows,
    items,
    totals: {
      payable: sumBy(counted, (i) => i.amount),
      planned: sumBy(counted, plannedOf),
      paid: sumBy(counted, (i) => Math.min(i.paidAmount, i.amount)),
      unpaid: sumBy(counted, outstandingOf),
      debt: sumBy(rows, (r) => r.debtRemaining),
      dueSoonOrOverdue: rows.filter((r) => r.state === 'due_soon' || r.state === 'overdue').length,
    },
    cash: cashCheck(engine, month, items),
    byInstitution,
  };
}

function rowAmounts(items: DueItem[]) {
  return {
    amount: sumBy(items, (i) => i.amount),
    planned: sumBy(items, plannedOf),
    paidAmount: sumBy(items, (i) => i.paidAmount),
    state: aggregateState(items),
  };
}

function firstOpenDate(items: DueItem[]): ISODate | undefined {
  return (items.find((i) => i.state !== 'paid') ?? items[0])?.dueDate;
}

/** "Gộp theo ngày": nhóm các dòng có cùng (tổ chức, ngày đến hạn) và có khoản phải trả. */
export function groupRowsByDate(rows: SummaryRow[]): SummaryRow[] {
  const out: SummaryRow[] = [];
  const groups = new Map<string, SummaryRow>();
  for (const r of rows) {
    if (r.items.length === 0 || !r.dueDate || r.kind === 'credit_card') {
      out.push(r);
      continue;
    }
    const k = `${r.institutionId}|${r.dueDate}`;
    const g = groups.get(k);
    if (!g) {
      const copy = { ...r, items: [...r.items], memberIds: [...r.memberIds] };
      groups.set(k, copy);
      out.push(copy);
      continue;
    }
    g.memberIds.push(r.obligationId);
    g.items.push(...r.items);
    g.amount += r.amount;
    g.planned += r.planned;
    g.paidAmount += r.paidAmount;
    g.debtRemaining += r.debtRemaining;
    g.state = aggregateState(g.items);
    g.key = `group:${k}`;
    g.label = `${r.institution} · ${g.memberIds.length} khoản`;
  }
  return out;
}
