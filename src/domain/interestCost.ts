import { monthOf } from './dates';
import type { Engine } from './engine';
import type { Money, YearMonth } from './types';

export interface InterestCost {
  /** Lãi + phí các kỳ chưa trả của mọi khoản trả góp đang mở */
  remaining: Money;
  remainingInterest: Money;
  remainingFees: Money;
  /** Lãi + phí đã trả (các kỳ đã trả đủ) */
  paid: Money;
  /** Lãi + phí của các kỳ đến hạn trong `month` */
  thisMonth: Money;
}

/** Tổng chi phí lãi (lãi + phí theo kỳ) của các khoản trả góp; không gồm lãi thẻ (trả đủ sao kê thì 0). */
export function interestCost(engine: Engine, month: YearMonth): InterestCost {
  let remainingInterest = 0;
  let remainingFees = 0;
  let paid = 0;
  let thisMonth = 0;
  for (const loan of engine.loans()) {
    const led = engine.ledger(loan);
    for (const r of engine.schedule(loan)) {
      const cost = r.interest + r.fees;
      if (led.rows[r.n - 1]?.paid) paid += cost;
      else {
        remainingInterest += r.interest;
        remainingFees += r.fees;
      }
      if (monthOf(r.dueDate) === month) thisMonth += cost;
    }
  }
  return { remaining: remainingInterest + remainingFees, remainingInterest, remainingFees, paid, thisMonth };
}
