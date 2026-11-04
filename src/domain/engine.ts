import { endOfMonth, monthOf } from './dates';
import { applyLedger, type LoanLedger } from './ledger';
import { roundMoney, sumBy } from './money';
import { buildSchedule } from './schedule';
import type {
  CardPaymentPolicy,
  CreditCardObligation,
  InstallmentLoanObligation,
  Institution,
  ISODate,
  Money,
  Obligation,
  Payment,
  ProfileState,
  ScheduleRow,
  Statement,
  StatementBased,
  YearMonth,
} from './types';
import './rules';

/**
 * Ngữ cảnh tính toán cho một ProfileState + today. Mọi kết quả là hàm thuần của (state, today);
 * engine chỉ cache để không tính lại bảng kỳ hạn nhiều lần.
 */
export interface Engine {
  state: ProfileState;
  today: ISODate;
  institution(id: string): Institution | undefined;
  obligation(id: string): Obligation | undefined;
  /** Khoản chưa đóng */
  open(): Obligation[];
  loans(): InstallmentLoanObligation[];
  statementBased(): StatementBased[];
  schedule(ob: InstallmentLoanObligation): ScheduleRow[];
  ledger(ob: InstallmentLoanObligation): LoanLedger;
  payments(obligationId: string): Payment[];
  statements(obligationId: string): Statement[];
  /** Sao kê mới nhất có hạn trả ≤ cuối tháng */
  currentStatement(obligationId: string, month: YearMonth): Statement | undefined;
  policyOf(ob: StatementBased): CardPaymentPolicy;
  statementAmount(ob: StatementBased, st: Statement): Money;
  statementPaid(ob: StatementBased, st: Statement): Money;
  /** Dư nợ thẻ hiện tại (sau các khoản đã trả kể từ khi nhập sao kê) */
  cardBalance(ob: StatementBased, month: YearMonth): Money;
  /** Tháng của chu kỳ sao kê đang xét */
  cycleMonth(ob: StatementBased, month: YearMonth): YearMonth;
  /** Khoản vay gộp vào sao kê của thẻ */
  billedLoans(cardId: string): InstallmentLoanObligation[];
  /** Gốc vay gộp sao kê chưa lên sao kê (= gốc còn lại − gốc các kỳ đã/đang trong sao kê) */
  unbilledPrincipal(loan: InstallmentLoanObligation, cycle: YearMonth): Money;
  /** Dư nợ khoản vay theo settings.loanDebtMeasure */
  loanDebt(loan: InstallmentLoanObligation): Money;
}

export function createEngine(state: ProfileState, today: ISODate): Engine {
  const settings = state.profile.settings;
  const instById = new Map(state.institutions.map((i) => [i.id, i]));
  const obById = new Map(state.obligations.map((o) => [o.id, o]));
  const schedules = new Map<string, ScheduleRow[]>();
  const ledgers = new Map<string, LoanLedger>();
  const paymentsBy = new Map<string, Payment[]>();
  for (const p of state.payments) paymentsBy.set(p.obligationId, [...(paymentsBy.get(p.obligationId) ?? []), p]);
  const statementsBy = new Map<string, Statement[]>();
  for (const s of [...state.statements].sort((a, b) => a.statementDate.localeCompare(b.statementDate))) {
    statementsBy.set(s.obligationId, [...(statementsBy.get(s.obligationId) ?? []), s]);
  }

  const open = () => state.obligations.filter((o) => o.status !== 'closed');

  const engine: Engine = {
    state,
    today,
    institution: (id) => instById.get(id),
    obligation: (id) => obById.get(id),
    open,
    loans: () => open().filter((o): o is InstallmentLoanObligation => o.kind === 'installment_loan'),
    statementBased: () => open().filter((o): o is StatementBased => o.kind === 'credit_card' || o.kind === 'revolving'),

    schedule(ob) {
      let s = schedules.get(ob.id);
      if (!s) {
        s = buildSchedule(ob, instById.get(ob.institutionId), settings);
        schedules.set(ob.id, s);
      }
      return s;
    },

    ledger(ob) {
      let l = ledgers.get(ob.id);
      if (!l) {
        const parent = ob.link?.billedIntoStatement && ob.link.parentObligationId ? obById.get(ob.link.parentObligationId) : undefined;
        const paidCycles =
          parent && (parent.kind === 'credit_card' || parent.kind === 'revolving')
            ? new Set(
                engine
                  .statements(parent.id)
                  .filter((st) => {
                    const amt = engine.statementAmount(parent, st);
                    return amt > 0 && engine.statementPaid(parent, st) >= amt;
                  })
                  .map((st) => monthOf(st.dueDate)),
              )
            : undefined;
        l = applyLedger(ob, engine.schedule(ob), engine.payments(ob.id), paidCycles);
        ledgers.set(ob.id, l);
      }
      return l;
    },

    payments: (id) => paymentsBy.get(id) ?? [],
    statements: (id) => statementsBy.get(id) ?? [],

    currentStatement(id, month) {
      const end = endOfMonth(month);
      const list = engine.statements(id).filter((s) => s.dueDate <= end);
      return list[list.length - 1];
    },

    policyOf: (ob) => (ob.kind === 'credit_card' ? ob.paymentPolicy : undefined) ?? settings.defaultCardPaymentPolicy,

    statementAmount(ob, st) {
      if (ob.kind === 'revolving') return st.minimumDue ?? st.statementBalance;
      const policy = engine.policyOf(ob);
      if (typeof policy === 'object') return Math.min(policy.amount, st.currentBalance);
      if (policy === 'current_balance') return st.currentBalance;
      if (policy === 'statement_balance') return st.statementBalance;
      return minimumDue(engine, ob, st);
    },

    statementPaid: (ob, st) =>
      sumBy(engine.payments(ob.id).filter((p) => p.dueItemKey === `${ob.id}:${st.id}`), (p) => p.amount),

    cardBalance(ob, month) {
      const list = engine.statements(ob.id);
      const st = engine.currentStatement(ob.id, month) ?? list[list.length - 1];
      if (!st) return 0;
      const paidSince = sumBy(engine.payments(ob.id).filter((p) => p.date >= st.capturedAt), (p) => p.amount);
      return Math.max(0, st.currentBalance - paidSince);
    },

    cycleMonth(ob, month) {
      const st = engine.currentStatement(ob.id, month);
      return st ? monthOf(st.dueDate) : month;
    },

    billedLoans: (cardId) =>
      engine.loans().filter((l) => l.link?.billedIntoStatement && l.link.parentObligationId === cardId),

    unbilledPrincipal(loan, cycle) {
      const led = engine.ledger(loan);
      const billed = engine
        .schedule(loan)
        .filter((r) => !led.rows[r.n - 1].paid && monthOf(r.dueDate) <= cycle);
      return Math.max(0, led.principalRemaining - sumBy(billed, (r) => r.principal));
    },

    loanDebt(loan) {
      const led = engine.ledger(loan);
      const measure = settings.loanDebtMeasure;
      const usePrincipal = measure === 'principal' || (measure === 'auto' && !!loan.link?.sharesCreditLimit);
      return usePrincipal ? led.principalRemaining : led.remainingPayments;
    },
  };
  return engine;
}

/** Gốc các kỳ trả góp gộp sao kê có hạn trong chu kỳ của sao kê `st` (theo các khoản vay đã nhập). */
export function billedInstallmentPrincipal(engine: Engine, ob: CreditCardObligation, st: Statement): Money {
  const cycle = monthOf(st.dueDate);
  return sumBy(engine.billedLoans(ob.id), (l) => sumBy(engine.schedule(l).filter((r) => monthOf(r.dueDate) === cycle), (r) => r.principal));
}

/**
 * Thanh toán tối thiểu của sao kê: số ngân hàng ghi, nếu không thì theo quy tắc tối thiểu của thẻ.
 * Theo sao kê VIB: tối thiểu = gốc trả góp trong kỳ + % × (dư nợ − gốc trả góp); lãi/phí trả góp nằm trong phần %.
 */
export function minimumDue(engine: Engine, ob: CreditCardObligation, st: Statement): Money {
  if (st.minimumDue !== undefined) return st.minimumDue;
  const rule = ob.minimumPayment ?? { percentOfStatement: 0.05, includeInstallmentsInFull: true };
  const installments = rule.includeInstallmentsInFull ? Math.min(st.statementBalance, billedInstallmentPrincipal(engine, ob, st)) : 0;
  const base = Math.max(0, st.statementBalance - installments);
  const min = Math.max(rule.floor ?? 0, roundMoney(base * rule.percentOfStatement)) + installments;
  return Math.min(min, st.statementBalance);
}

/**
 * Gốc trả góp nằm trong sao kê. Sao kê có số tối thiểu ngân hàng ghi thì suy ngược từ công thức tối thiểu
 * (bắt được cả gói trả góp chưa nhập vào app, vd. kỳ cuối của gói cũ); không khớp thì dùng các khoản đã nhập.
 */
export function statementInstallmentPrincipal(engine: Engine, ob: CreditCardObligation, st: Statement): Money {
  const known = billedInstallmentPrincipal(engine, ob, st);
  const rule = ob.minimumPayment ?? { percentOfStatement: 0.05, includeInstallmentsInFull: true };
  const pct = rule.percentOfStatement;
  const min = st.minimumDue;
  if (min === undefined || !rule.includeInstallmentsInFull || pct <= 0 || pct >= 1) return known;
  const p = Math.round((min - pct * st.statementBalance) / (1 - pct));
  const fits = (x: number) =>
    x >= 0 && x <= st.statementBalance && Math.abs(Math.max(rule.floor ?? 0, roundMoney((st.statementBalance - x) * pct)) + x - min) <= 1;
  return p > known && fits(p) ? p : known;
}
