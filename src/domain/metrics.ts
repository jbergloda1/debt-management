import { ear, irr } from './finance';
import { sumBy } from './money';
import { netDisbursedOf, separateFees, upfrontFeesOf } from './rules';
import { buildSchedule } from './schedule';
import type { InstallmentLoanObligation, Institution, Money, ProfileSettings, Rate } from './types';

export interface LoanMetrics {
  /** Lãi danh nghĩa/năm: IRR của (gốc + lãi) trên số tiền vay × 12 */
  nominalAPR: Rate;
  /** Lãi thực tế/năm: IRR của tổng trả (gồm phí mỗi kỳ) trên tiền thực nhận × 12 */
  effectiveAPR: Rate;
  /** (1 + r_tháng_thực_tế)^12 − 1 */
  EAR: Rate;
  totalPaid: Money;
  totalInterest: Money;
  totalFees: Money;
  /** Σ tổng trả + phí trả riêng − tiền thực nhận */
  totalCost: Money;
  netDisbursed: Money;
}

/**
 * Mục 6.3. Dùng IRR trên bảng kỳ hạn nên đúng cho mọi mô hình;
 * với số tiền mỗi kỳ cố định, kết quả trùng RATE(N, pmt, P) × 12 của Excel.
 */
export function loanMetrics(
  ob: InstallmentLoanObligation,
  inst: Institution | undefined,
  settings: Pick<ProfileSettings, 'weekendShift' | 'holidays'>,
): LoanMetrics {
  const rows = buildSchedule(ob, inst, settings);
  const net = netDisbursedOf(ob, inst);
  const rNominal = irr(ob.principal, rows.map((r) => r.principal + r.interest));
  const rEffective = irr(net, rows.map((r) => r.total));
  const totalPaid = sumBy(rows, (r) => r.total);
  const separate = sumBy(separateFees(upfrontFeesOf(ob, inst), ob.principal, ob.rounding), (f) => f.amount);
  return {
    nominalAPR: rNominal * 12,
    effectiveAPR: rEffective * 12,
    EAR: ear(rEffective),
    totalPaid,
    totalInterest: sumBy(rows, (r) => r.interest),
    totalFees: sumBy(rows, (r) => r.fees) + separate + (ob.principal - net),
    totalCost: totalPaid + separate - net,
    netDisbursed: net,
  };
}
