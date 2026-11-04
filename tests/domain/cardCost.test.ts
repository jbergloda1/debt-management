import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { createEngine } from '../../src/domain';
import { cardCost, payoffAtMinimum } from '../../src/domain/cardCost';
import type { CreditCardObligation } from '../../src/domain/types';

const today = '2026-11-04';
const engine = createEngine(appendixA, today);
const card = (id: string) => appendixA.obligations.find((o) => o.id === id) as CreditCardObligation;

describe('chi phí nếu không trả đủ thẻ (tham khảo)', () => {
  it('VIB: lãi 3,54%/tháng trên dư nợ trừ gốc trả góp; gốc trả góp suy từ số tối thiểu trên sao kê', () => {
    const c = cardCost(engine, card('card-vib'), '2026-11')!;
    expect(c).toMatchObject({
      // Sao kê 25/10: gốc kỳ 6/6 gói cũ 1.416.307 (chưa nhập vào app) + gốc kỳ 1/9 1.960.895
      installments: 3377202,
      interestBase: 3869581, // chi tiêu 3.716.620 + lãi trả góp 152.961
      minimum: 3570681,
      minimumEstimated: false,
      interest: { min: 136983, max: 136983 }, // 3.869.581 × 3,54%
      lateFee: undefined, // chưa nhập phí chậm thanh toán
    });
    expect(c.payoff!.atMin.months).toBeGreaterThan(120);
  });

  it('Sacombank: lãi 2–3,19%/tháng, phí chậm 6% tối thiểu 200.000', () => {
    const c = cardCost(engine, card('card-sac'), '2026-11')!;
    expect(c).toMatchObject({
      installments: 0,
      interestBase: 7891193,
      minimum: 236736, // 3% × 7.891.193 (sao kê)
      minimumEstimated: false,
      interest: { min: 157824, max: 251729 },
      lateFee: 200000, // 6% × 236.736 = 14.204 < 200.000
    });
    expect(c.payoff!.atMax.totalInterest).toBeGreaterThan(c.payoff!.atMin.totalInterest);
  });

  it('tối thiểu ước tính: gốc trả góp trả đủ, lãi trả góp nằm trong phần % (công thức sao kê VIB)', () => {
    const s = { ...appendixA, statements: appendixA.statements.map((st) => ({ ...st, minimumDue: undefined })) };
    const c = cardCost(createEngine(s, today), card('card-vib'), '2026-11')!;
    // app chỉ biết kỳ 1/9: 1.960.895 + 5% × (7.246.783 − 1.960.895)
    expect(c).toMatchObject({ installments: 1960895, minimum: 1960895 + 264294, minimumEstimated: true });
  });

  it('trả tối thiểu: có mức sàn thì hết nhanh; không mức sàn thì giảm dần tới dưới 10.000', () => {
    expect(payoffAtMinimum(1000000, 0, 0.1, 100000)).toEqual({ months: 10, totalInterest: 0, capped: false });
    expect(payoffAtMinimum(1000000, 0, 0.1).months).toBe(44); // 0,9^44 × 1tr < 10.000
    expect(payoffAtMinimum(1000000, 0.06, 0.05).capped).toBe(true); // lãi > % tối thiểu → không bao giờ hết
  });
});
