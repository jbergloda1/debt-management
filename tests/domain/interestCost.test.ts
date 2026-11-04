import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { createEngine } from '../../src/domain';
import { interestCost } from '../../src/domain/interestCost';

describe('tổng chi phí lãi', () => {
  it('cộng lãi + phí các kỳ chưa trả của mọi khoản trả góp', () => {
    const c = interestCost(createEngine(appendixA, '2026-11-04'), '2026-11');
    expect(c).toEqual({ remaining: 11696658, remainingInterest: 11456658, remainingFees: 240000, paid: 18309150, thisMonth: 1582929 });
  });

  it('khoản đã đóng không tính', () => {
    const s = { ...appendixA, obligations: appendixA.obligations.map((o) => ({ ...o, status: 'closed' as const })) };
    expect(interestCost(createEngine(s, '2026-11-04'), '2026-11').remaining).toBe(0);
  });
});
