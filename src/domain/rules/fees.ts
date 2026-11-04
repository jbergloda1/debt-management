import { roundMoney, sumBy } from '../money';
import type { FeeRule, InstallmentLoanObligation, Institution, Money, RoundingPolicy } from '../types';

export const perPeriodFeesOf = (ob: InstallmentLoanObligation, inst?: Institution): FeeRule[] =>
  ob.perPeriodFees ?? inst?.defaults?.perPeriodFee ?? [];

export const upfrontFeesOf = (ob: InstallmentLoanObligation, inst?: Institution): FeeRule[] =>
  ob.upfrontFees ?? inst?.defaults?.upfrontFees ?? [];

function feeAmount(fee: FeeRule, principal: Money, installment: Money, rounding?: RoundingPolicy): Money {
  switch (fee.amount.type) {
    case 'fixed':
      return fee.amount.value;
    case 'percent_of_principal':
      return roundMoney(principal * fee.amount.rate, rounding);
    case 'percent_of_installment':
      return roundMoney(installment * fee.amount.rate, rounding);
  }
}

const appliesTo = (fee: FeeRule, n: number) =>
  n >= (fee.appliesFromPeriod ?? 1) && n <= (fee.appliesToPeriod ?? Number.POSITIVE_INFINITY);

/** Phí cộng vào kỳ n (timing = per_period). */
export function periodFees(fees: FeeRule[], n: number, principal: Money, installment: Money, rounding?: RoundingPolicy): Money {
  return sumBy(
    fees.filter((f) => f.timing === 'per_period' && appliesTo(f, n)),
    (f) => feeAmount(f, principal, installment, rounding),
  );
}

/** Tổng phí trừ khi giải ngân. */
export const upfrontDeducted = (fees: FeeRule[], principal: Money, rounding?: RoundingPolicy) =>
  sumBy(fees.filter((f) => f.timing === 'upfront_deducted'), (f) => feeAmount(f, principal, 0, rounding));

/** Các phí phải trả riêng một lần (sinh DueItem riêng). */
export const separateFees = (fees: FeeRule[], principal: Money, rounding?: RoundingPolicy) =>
  fees
    .filter((f) => f.timing === 'upfront_paid' || f.timing === 'one_time')
    .map((f) => ({ fee: f, amount: feeAmount(f, principal, 0, rounding) }));

/** Tiền thực nhận: ưu tiên số người dùng nhập, nếu không thì gốc − phí trừ trước. */
export const netDisbursedOf = (ob: InstallmentLoanObligation, inst?: Institution): Money =>
  ob.netDisbursed ?? ob.principal - upfrontDeducted(upfrontFeesOf(ob, inst), ob.principal, ob.rounding);
