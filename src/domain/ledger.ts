import { monthOf } from './dates';
import { sumBy } from './money';
import type { InstallmentLoanObligation, Money, Payment, ScheduleRow, YearMonth } from './types';

export interface RowStatus {
  n: number;
  paidAmount: Money;
  paid: boolean;
}

export interface LoanLedger {
  rows: RowStatus[];
  /** = opening.periodsPaid + số kỳ trả đủ sau đó */
  periodsPaid: number;
  principalRemaining: Money;
  /** Tổng còn phải trả (gốc + lãi + phí) của các kỳ chưa trả */
  remainingPayments: Money;
  nextUnpaid?: ScheduleRow;
  lastUnpaid?: ScheduleRow;
}

export const loanItemKey = (obligationId: string, n: number) => `${obligationId}:${n}`;

/** Số kỳ đáng ra đã trả theo lịch tính đến ngày asOf (dùng cho kiểm tra PERIOD_MISMATCH). */
export const expectedPaidAt = (schedule: ScheduleRow[], asOf: string) => schedule.filter((r) => r.dueDate < asOf).length;

/**
 * Áp payments vào bảng kỳ hạn (P5: suy ra trạng thái từ sự thật).
 * - Kỳ n ≤ opening.periodsPaid coi như đã trả.
 * - Khoản gộp sao kê: kỳ thuộc chu kỳ thẻ đã trả đủ coi như đã trả (`paidCycles`).
 * - Payment có dueItemKey gắn đúng kỳ; payment không có key phân bổ FIFO vào kỳ chưa trả sớm nhất.
 */
export function applyLedger(
  ob: InstallmentLoanObligation,
  schedule: ScheduleRow[],
  payments: Payment[],
  paidCycles?: Set<YearMonth>,
): LoanLedger {
  const opening = ob.opening?.periodsPaid ?? 0;
  const prefix = `${ob.id}:`;
  const keyed = new Map<number, Money>();
  let pool = 0;
  for (const p of payments) {
    const n = p.dueItemKey?.startsWith(prefix) ? Number(p.dueItemKey.slice(prefix.length)) : NaN;
    if (Number.isInteger(n)) keyed.set(n, (keyed.get(n) ?? 0) + p.amount);
    else if (!p.dueItemKey) pool += p.amount;
  }

  const rows: RowStatus[] = schedule.map((r) => {
    if (r.n <= opening || paidCycles?.has(monthOf(r.dueDate))) return { n: r.n, paidAmount: r.total, paid: true };
    return { n: r.n, paidAmount: keyed.get(r.n) ?? 0, paid: false };
  });
  for (const [i, s] of rows.entries()) {
    if (s.paid) continue;
    const need = Math.max(0, schedule[i].total - s.paidAmount);
    const take = Math.min(pool, need);
    s.paidAmount += take;
    pool -= take;
    s.paid = schedule[i].total > 0 && s.paidAmount >= schedule[i].total;
  }

  const paidAfterOpening = schedule.filter((r, i) => rows[i].paid && r.n > opening);
  const principalRemaining =
    ob.opening?.principalRemaining !== undefined
      ? ob.opening.principalRemaining - sumBy(paidAfterOpening, (r) => r.principal)
      : ob.principal - sumBy(schedule.filter((_, i) => rows[i].paid), (r) => r.principal);
  const unpaid = schedule.filter((_, i) => !rows[i].paid);

  return {
    rows,
    periodsPaid: rows.filter((r) => r.paid).length,
    principalRemaining: Math.max(0, principalRemaining),
    remainingPayments: sumBy(unpaid, (r) => r.total - rows[r.n - 1].paidAmount),
    nextUnpaid: unpaid[0],
    lastUnpaid: unpaid[unpaid.length - 1],
  };
}
