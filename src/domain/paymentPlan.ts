import { cardCost, lateFee, type Range } from './cardCost';
import type { CashCheck } from './cashflow';
import { maxDate } from './dates';
import { minimumDue, type Engine } from './engine';
import type { MonthlySummary } from './summary';
import type { DueItem, ID, ISODate, LateFeeRule, Money } from './types';

export interface PlanLine {
  key: string;
  obligationId: ID;
  label: string;
  dueDate: ISODate;
  isCard: boolean;
  /** Số còn phải trả nếu trả đủ (theo cách trả của thẻ / số tiền kỳ) */
  full: Money;
  /** Phần bắt buộc để không bị phạt / chuyển nhóm nợ (thẻ: tối thiểu; khoản vay: cả kỳ) */
  minimum: Money;
  /** Thẻ: trả tới đây trước hạn thì không mất lãi (dư nợ sao kê) */
  clear: Money;
  /** Trả trước hạn */
  onTime: Money;
  /** Trả sau hạn, khi có tiền về (thẻ: trả thêm giảm lãi kỳ sau; khoản trễ: bù cho đủ) */
  later: Money;
  /** = onTime + later */
  suggested: Money;
  /** Tốn thêm nếu làm theo kế hoạch */
  cost: Range;
  /** Trả trước hạn dưới mức bắt buộc → trễ hạn (phí phạt; trễ từ 10 ngày bị chuyển nhóm nợ CIC) */
  late: boolean;
  /** Trễ hạn nhưng chưa nhập phí phạt cho khoản này */
  feeUnknown: boolean;
}

export interface PaymentPlan {
  /** Tiền dùng để trả nợ cả tháng = số dư + thu nhập còn về − chi tiêu còn lại */
  budget: Money;
  needFull: Money;
  needMinimum: Money;
  lines: PlanLine[];
  totalCost: Range;
  leftover: Money;
  /** Đủ tiền trả mọi phần bắt buộc đúng hạn */
  minimumsCovered: boolean;
}

const ZERO: Range = { min: 0, max: 0 };
const addRange = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max });
const END = '9999-12-31';

type Work = PlanLine & { payDate: ISODate; rate: number; interest: Range; fee?: { lateFee?: LateFeeRule } };

/**
 * Chia tiền cho các khoản chưa trả của tháng sao cho tốn ít lãi/phí nhất. Mỗi khoản trả đúng hạn chỉ dùng
 * tiền đã có tới ngày hạn của nó (số dư + thu nhập về trước đó − chi tiêu trước đó) và không làm hụt tiền
 * cho các ngày sau; phần "trả sau" dùng tiền còn lại của cả tháng.
 * 1. phần bắt buộc đúng hạn, hạn sớm trước — trả thiếu một phần vẫn là trễ nên chỉ nhận khoản trả đủ được;
 * 2. khoản bị trễ: bù cho đủ phần bắt buộc ngay khi có tiền (giảm phí theo %, tránh trễ quá 10 ngày);
 * 3. trả hẳn sao kê thẻ trước hạn, thẻ có "lãi tránh được / tiền cần thêm" cao nhất trước
 *    (không trả đủ sao kê là mất miễn lãi trên toàn bộ phần chi tiêu);
 * 4. còn dư: trả thêm thẻ lãi tháng cao nhất (giảm lãi kỳ sau), tới dư nợ sao kê rồi tới số phải trả đầy đủ.
 * Bỏ qua số dự định (plannedAmounts) — luôn tính từ số phải trả đầy đủ.
 */
export function paymentPlan(engine: Engine, month: string, items: DueItem[], cash: Pick<CashCheck, 'balances' | 'timeline'>): PaymentPlan {
  const lines: Work[] = [];
  for (const it of items) {
    if (it.includedIn || it.state === 'paid') continue;
    const ob = engine.obligation(it.obligationId);
    if (!ob) continue;
    const full = Math.max(0, it.amount - it.paidAmount);
    if (full === 0) continue;
    const base = {
      key: it.key,
      obligationId: ob.id,
      label: `${ob.name} · ${it.label}`,
      dueDate: it.dueDate,
      payDate: maxDate(it.dueDate, engine.today),
      full,
      onTime: 0,
      later: 0,
      suggested: 0,
      cost: ZERO,
      late: false,
      feeUnknown: false,
    };
    if (ob.kind === 'credit_card') {
      const c = cardCost(engine, ob, month);
      const st = c?.statement;
      const minimum = st ? Math.min(full, Math.max(0, minimumDue(engine, ob, st) - it.paidAmount)) : full;
      const clear = st ? Math.min(full, Math.max(minimum, st.statementBalance - it.paidAmount)) : full;
      lines.push({ ...base, isCard: true, minimum, clear, rate: c?.monthlyRate?.max ?? 0, interest: c?.interest ?? ZERO, fee: ob });
    } else {
      // Khoản vay / sao kê hạn mức / lịch tự nhập: phải trả cả kỳ
      lines.push({ ...base, isCard: false, minimum: full, clear: full, rate: 0, interest: ZERO, fee: ob.kind === 'installment_loan' ? ob : undefined });
    }
  }

  // Tiền có tới ngày d (thu/chi trong ngày tính trước khoản trả nợ, như dòng tiền theo ngày)
  const flows = cash.timeline.filter((e) => e.kind !== 'debt');
  const avail = (d: ISODate) => cash.balances + flows.filter((e) => e.date <= d).reduce((s, e) => s + e.delta, 0);
  const checkpoints = [...new Set([...lines.map((l) => l.payDate), END])].map((d) => ({ d, avail: avail(d) }));
  const spentBy = (d: ISODate) => lines.reduce((s, k) => s + (k.payDate <= d ? k.onTime : 0) + (d === END ? k.later : 0), 0);
  /** Trả thêm được bao nhiêu ở ngày `from` mà không ngày nào từ đó trở đi bị âm tiền */
  const slack = (from: ISODate) => Math.min(...checkpoints.filter((c) => c.d >= from).map((c) => c.avail - spentBy(c.d)));
  const paid = (l: Work) => l.onTime + l.later;
  const onTime = (l: Work, upTo: Money) => {
    l.onTime += Math.max(0, Math.min(slack(l.payDate), upTo - paid(l)));
  };
  const later = (l: Work, upTo: Money) => {
    l.later += Math.max(0, Math.min(slack(END), upTo - paid(l)));
  };

  const byDue = [...lines].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const cards = lines.filter((l) => l.isCard);
  const worth = (l: Work) => (l.clear > l.minimum ? l.interest.max / (l.clear - l.minimum) : 0);
  const byRate = [...cards].sort((a, b) => b.rate - a.rate);

  for (const l of byDue) if (slack(l.payDate) >= l.minimum) onTime(l, l.minimum); // 1
  for (const l of byDue) if (l.onTime < l.minimum) later(l, l.minimum); // 2
  for (const l of [...cards].sort((a, b) => worth(b) - worth(a))) {
    if (l.onTime >= l.minimum && slack(l.payDate) >= l.clear - l.onTime) onTime(l, l.clear); // 3
  }
  for (const l of byRate) later(l, l.clear); // 4
  for (const l of byRate) {
    if (l.onTime >= l.clear) onTime(l, l.full); // đã trả hẳn sao kê: phần dư nợ mới trả luôn nếu có tiền
    later(l, l.full);
  }

  for (const l of lines) {
    l.suggested = paid(l);
    if (l.onTime >= l.clear) continue;
    let cost = l.interest;
    if (l.onTime < l.minimum) {
      l.late = true;
      const fee = l.fee ? lateFee(l.fee, l.minimum - l.onTime) : undefined;
      l.feeUnknown = fee === undefined;
      cost = addRange(cost, { min: fee ?? 0, max: fee ?? 0 });
    }
    l.cost = cost;
  }

  const budget = avail(END);
  return {
    budget,
    needFull: lines.reduce((s, l) => s + l.full, 0),
    needMinimum: lines.reduce((s, l) => s + l.minimum, 0),
    lines: lines.map(({ payDate: _p, rate: _r, interest: _i, fee: _f, ...l }) => l),
    totalCost: lines.reduce((s, l) => addRange(s, l.cost), ZERO),
    leftover: budget - spentBy(END),
    minimumsCovered: lines.every((l) => !l.late),
  };
}

export const planForSummary = (engine: Engine, s: MonthlySummary) => paymentPlan(engine, s.month, s.items, s.cash);

/**
 * plannedAmounts sau khi áp dụng kế hoạch: ghi phần trả đúng hạn làm số dự định (khoản trả đủ thì bỏ số dự định).
 * Phần "trả sau" không ghi vào hạn vì sẽ trả sau ngày hạn — dòng tiền tháng để lại số đó làm tiền còn lại.
 */
export function applyPlan(planned: Record<string, Money>, plan: PaymentPlan, items: DueItem[]): Record<string, Money> {
  const next = { ...planned };
  for (const l of plan.lines) {
    const alreadyPaid = items.find((i) => i.key === l.key)?.paidAmount ?? 0;
    if (l.onTime >= l.full) delete next[l.key];
    else next[l.key] = alreadyPaid + l.onTime;
  }
  return next;
}

/** Kế hoạch đang được dùng: mọi khoản trả thiếu có số dự định đúng bằng phần trả đúng hạn của kế hoạch. */
export function planApplied(plan: PaymentPlan, items: DueItem[]): boolean {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const partial = plan.lines.filter((l) => l.onTime < l.full);
  return (
    partial.length > 0 &&
    partial.every((l) => {
      const it = byKey.get(l.key);
      return it?.plannedAmount !== undefined && it.plannedAmount === it.paidAmount + l.onTime;
    })
  );
}
