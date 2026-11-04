import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { createEngine } from '../../src/domain';
import { cardCost, payoffAtMinimum } from '../../src/domain/cardCost';
import type { CreditCardObligation } from '../../src/domain/types';

const today = '2026-11-04';
const engine = createEngine(appendixA, today);
const card = (id: string) => appendixA.obligations.find((o) => o.id === id) as CreditCardObligation;

describe('chi phí nếu không trả đủ thẻ (tham khảo)', () => {
  it('VIB: lãi 3,54%/tháng trên phần chi tiêu (không tính kỳ trả góp), tối thiểu theo email ngân hàng', () => {
    const c = cardCost(engine, card('card-vib'), '2026-11')!;
    expect(c).toMatchObject({
      installments: 1960895,
      interestBase: 7246783 - 1960895,
      minimum: 3570681,
      minimumEstimated: false,
      interest: { min: 187120, max: 187120 }, // 5.285.888 × 3,54%
      lateFee: undefined, // chưa nhập phí chậm thanh toán
    });
    expect(c.payoff!.atMin.months).toBeGreaterThan(120);
  });

  it('Sacombank: lãi 2–3,19%/tháng, phí chậm 6% tối thiểu 200.000', () => {
    const c = cardCost(engine, card('card-sac'), '2026-11')!;
    expect(c).toMatchObject({
      installments: 0,
      interestBase: 7891193,
      minimum: 394560, // 5% (ước tính, sao kê không ghi)
      minimumEstimated: true,
      interest: { min: 157824, max: 251729 },
      lateFee: 200000, // 6% × 394.560 = 23.674 < 200.000
    });
    expect(c.payoff!.atMax.totalInterest).toBeGreaterThan(c.payoff!.atMin.totalInterest);
  });

  it('trả tối thiểu: có mức sàn thì hết nhanh; không mức sàn thì giảm dần tới dưới 10.000', () => {
    expect(payoffAtMinimum(1000000, 0, 0.1, 100000)).toEqual({ months: 10, totalInterest: 0, capped: false });
    expect(payoffAtMinimum(1000000, 0, 0.1).months).toBe(44); // 0,9^44 × 1tr < 10.000
    expect(payoffAtMinimum(1000000, 0.06, 0.05).capped).toBe(true); // lãi > % tối thiểu → không bao giờ hết
  });
});
