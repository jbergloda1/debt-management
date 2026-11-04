import { endOfMonth, monthOf, monthRange, startOfMonth } from './dates';
import { incomeOccurrences } from './cashflow';
import type { Engine } from './engine';
import { sumBy } from './money';
import type { ID, ISODate, Money, Scenario, YearMonth } from './types';

export interface ProjectionLine {
  obligationId: ID;
  label: string;
  amount: Money;
  kind: 'installment' | 'card' | 'extra' | 'custom';
}

export interface ProjectionMonth {
  month: YearMonth;
  installments: Money;
  cards: Money;
  extra: Money;
  outflow: Money;
  income: Money;
  carryIn: Money;
  leftover: Money;
  /** Dư nợ còn lại cuối tháng */
  debtEnd: Money;
  payoffs: { obligationId: ID; name: string }[];
  lines: ProjectionLine[];
}

export interface Projection {
  months: ProjectionMonth[];
  /** Ngày đến hạn cuối cùng của mọi khoản vay — "hết nợ" (không tính chi tiêu thẻ mới) */
  debtFreeDate?: ISODate;
  firstShortMonth?: YearMonth;
}

/**
 * Mục 12. Mô phỏng từ `fromMonth` trong `scenario.horizonMonths` tháng.
 * Giả định mọi kỳ đến hạn được trả đúng hạn; thẻ: tháng m phải trả chi tiêu mới (theo scenario)
 * + các kỳ trả góp gộp vào sao kê của tháng m.
 */
export function project(engine: Engine, scenario: Scenario, fromMonth: YearMonth): Projection {
  const months = monthRange(fromMonth, scenario.horizonMonths);
  const fromStart = startOfMonth(fromMonth);
  const loans = engine.loans().filter((l) => l.status === 'active');
  const cards = engine.statementBased().filter((c) => c.status === 'active');
  const customs = engine.open().filter((o) => o.kind === 'custom' && o.status === 'active');

  // Các kỳ chưa trả của từng khoản vay
  const unpaidRows = new Map(
    loans.map((l) => {
      const led = engine.ledger(l);
      return [l.id, engine.schedule(l).filter((r) => !led.rows[r.n - 1].paid)] as const;
    }),
  );

  let extraCum = 0;
  let carry = 0;
  const out: ProjectionMonth[] = [];

  months.forEach((m, idx) => {
    const end = endOfMonth(m);
    const inThisMonth = (d: ISODate) => monthOf(d) === m || (idx === 0 && !scenario.assumeAllPaidOnTime && d < fromStart);
    const lines: ProjectionLine[] = [];

    for (const l of loans) {
      const rows = unpaidRows.get(l.id)!.filter((r) => inThisMonth(r.dueDate));
      const amount = sumBy(rows, (r) => r.total);
      if (!amount) continue;
      const billedTo = l.link?.billedIntoStatement ? l.link.parentObligationId : undefined;
      lines.push({ obligationId: billedTo ?? l.id, label: l.name, amount, kind: billedTo ? 'card' : 'installment' });
    }

    for (const c of cards) {
      let amount = scenario.cardMonthlySpending[c.id] ?? 0;
      if (idx === 0 && !scenario.assumeAllPaidOnTime) {
        const list = engine.statements(c.id);
        const st = list[list.length - 1];
        if (st && st.dueDate < fromStart) amount += Math.max(0, engine.statementAmount(c, st) - engine.statementPaid(c, st));
      }
      if (amount) lines.push({ obligationId: c.id, label: c.name, amount, kind: 'card' });
    }

    for (const o of customs) {
      if (o.kind !== 'custom') continue;
      const amount = sumBy(o.schedule.filter((e) => inThisMonth(e.dueDate) && e.dueDate >= engine.today), (e) => e.amount);
      if (amount) lines.push({ obligationId: o.id, label: o.name, amount, kind: 'custom' });
    }

    for (const e of scenario.extraPayments ?? []) {
      if (e.month !== m) continue;
      lines.push({ obligationId: e.obligationId, label: `Trả thêm · ${engine.obligation(e.obligationId)?.name ?? ''}`, amount: e.amount, kind: 'extra' });
    }

    const installments = sumBy(lines.filter((x) => x.kind === 'installment' || x.kind === 'custom'), (x) => x.amount);
    const cardsAmt = sumBy(lines.filter((x) => x.kind === 'card'), (x) => x.amount);
    const extra = sumBy(lines.filter((x) => x.kind === 'extra'), (x) => x.amount);
    extraCum += extra;
    const outflow = installments + cardsAmt + extra;
    const income = scenario.incomeOverrides?.[m] ?? sumBy(incomeOccurrences(engine.state.incomes, m), (i) => i.amount);
    const carryIn = scenario.carryLeftover ? carry : 0;
    const leftover = income + carryIn - outflow;
    carry = leftover;

    // Dư nợ cuối tháng: phần khoản vay chưa đến hạn + chi tiêu thẻ của tháng (trả tháng sau)
    const loanDebt = sumBy(loans, (l) => {
      const rest = unpaidRows.get(l.id)!.filter((r) => r.dueDate > end);
      const measure = engine.state.profile.settings.loanDebtMeasure;
      const principal = measure === 'principal' || (measure === 'auto' && !!l.link?.sharesCreditLimit);
      return sumBy(rest, (r) => (principal ? r.principal : r.total));
    });
    const debtEnd = Math.max(0, loanDebt + sumBy(cards, (c) => scenario.cardMonthlySpending[c.id] ?? 0) - extraCum);

    const payoffs = loans
      .filter((l) => {
        const rows = unpaidRows.get(l.id)!;
        return rows.length > 0 && monthOf(rows[rows.length - 1].dueDate) === m;
      })
      .map((l) => ({ obligationId: l.id, name: l.name }));

    out.push({ month: m, installments, cards: cardsAmt, extra, outflow, income, carryIn, leftover, debtEnd, payoffs, lines });
  });

  const lastDates = [...unpaidRows.values()].map((rows) => rows[rows.length - 1]?.dueDate).filter((d): d is string => !!d);
  return {
    months: out,
    debtFreeDate: lastDates.sort().pop(),
    firstShortMonth: out.find((m) => m.leftover < 0)?.month,
  };
}
