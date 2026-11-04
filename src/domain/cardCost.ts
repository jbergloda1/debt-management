import { minimumDue, statementInstallmentPrincipal, type Engine } from './engine';
import { roundMoney } from './money';
import type { CreditCardObligation, LateFeeRule, Money, Rate, Statement, YearMonth } from './types';

/** Khoảng giá trị (ngân hàng công bố lãi suất dạng khoảng → lãi cũng là khoảng). */
export interface Range {
  min: number;
  max: number;
}

export interface PayoffEstimate {
  months: number;
  totalInterest: Money;
  /** Quá MAX_MONTHS vẫn chưa hết */
  capped: boolean;
}

export interface CardCostEstimate {
  statement: Statement;
  /** Gốc trả góp nằm trong sao kê (trả đủ trong số tối thiểu, không tính lãi) */
  installments: Money;
  /** Phần chịu lãi khi không trả đủ = dư nợ sao kê − gốc trả góp (gồm chi tiêu, lãi/phí trả góp) */
  interestBase: Money;
  minimum: Money;
  /** Tối thiểu suy từ quy tắc % (sao kê không ghi số ngân hàng báo) */
  minimumEstimated: boolean;
  monthlyRate?: Range;
  /** Lãi phát sinh một kỳ nếu không trả đủ dư nợ sao kê */
  interest?: Range;
  /** Phí chậm thanh toán nếu quá hạn mà chưa trả đủ tối thiểu */
  lateFee?: Money;
  /** Nếu kỳ nào cũng chỉ trả tối thiểu và không tiêu thêm */
  payoff?: { atMin: PayoffEstimate; atMax: PayoffEstimate };
}

const MAX_MONTHS = 600;

export function monthlyRates(card: CreditCardObligation): Range | undefined {
  if (card.annualRate === undefined) return undefined;
  const min = card.annualRate / 12;
  return { min, max: Math.max(min, (card.annualRateMax ?? card.annualRate) / 12) };
}

export function lateFee(ob: { lateFee?: LateFeeRule }, unpaidMinimum: Money): Money | undefined {
  const r = ob.lateFee;
  if (!r) return undefined;
  return Math.max(r.floor ?? 0, roundMoney(unpaidMinimum * r.percent));
}

/**
 * Trả tối thiểu mãi: mỗi kỳ cộng lãi vào dư nợ rồi trả max(% × dư nợ, mức sàn).
 * Không có mức sàn thì coi dư nợ dưới 10.000 là trả xong ở kỳ đó.
 */
export function payoffAtMinimum(balance: Money, monthlyRate: Rate, percent: Rate, floor = 0): PayoffEstimate {
  let b = balance;
  let totalInterest = 0;
  let months = 0;
  while (b > 0 && months < MAX_MONTHS) {
    const interest = roundMoney(b * monthlyRate);
    totalInterest += interest;
    b += interest;
    const pay = Math.max(floor, roundMoney(b * percent));
    b = pay >= b || b - pay < 10000 ? 0 : b - pay;
    months++;
  }
  return { months, totalInterest, capped: b > 0 };
}

/** Ước tính chi phí nếu không trả đủ thẻ trong kỳ có hạn trả thuộc `month`. */
export function cardCost(engine: Engine, card: CreditCardObligation, month: YearMonth): CardCostEstimate | undefined {
  const statement = engine.currentStatement(card.id, month);
  if (!statement) return undefined;
  const installments = statementInstallmentPrincipal(engine, card, statement);
  const interestBase = Math.max(0, statement.statementBalance - installments);
  const minimum = minimumDue(engine, card, statement);
  const rate = monthlyRates(card);
  const rule = card.minimumPayment ?? { percentOfStatement: 0.05, includeInstallmentsInFull: true };
  return {
    statement,
    installments,
    interestBase,
    minimum,
    minimumEstimated: statement.minimumDue === undefined,
    monthlyRate: rate,
    interest: rate && { min: roundMoney(interestBase * rate.min), max: roundMoney(interestBase * rate.max) },
    lateFee: lateFee(card, minimum),
    payoff:
      rate && interestBase > 0 && rule.percentOfStatement > 0
        ? {
            atMin: payoffAtMinimum(interestBase, rate.min, rule.percentOfStatement, rule.floor),
            atMax: payoffAtMinimum(interestBase, rate.max, rule.percentOfStatement, rule.floor),
          }
        : undefined,
  };
}
