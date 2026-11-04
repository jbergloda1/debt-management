import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { createEngine, monthlySummary } from '../../src/domain';
import { applyPlan, planApplied, planForSummary } from '../../src/domain/paymentPlan';
import type { ProfileState } from '../../src/domain/types';

const today = '2026-11-04';
/** Số dư `cash` hôm nay; lương 14.500.000 (hoặc `salary`) về 10/11 */
const withCash = (cash: number, salary = 14500000): ProfileState => ({
  ...appendixA,
  cashAccounts: [{ id: 'a', name: 'TK', balance: cash, updatedAt: today }],
  incomes: appendixA.incomes.map((i) => ({ ...i, amount: salary })),
});
const plan = (s: ProfileState) => planForSummary(createEngine(s, today), monthlySummary(s, '2026-11', today));
const line = (p: ReturnType<typeof plan>, name: string) => p.lines.find((l) => l.label.startsWith(name))!;

// Hạn trong tháng 11: Sacombank 05/11 (tối thiểu 394.560), VIB 09/11 (tối thiểu 3.570.681),
// Shinhan 15/11 (5.101.434), Vay tiêu dùng 1–3 + SFinance 19/11 — lương về 10/11.
describe('kế hoạch trả khi thiếu tiền', () => {
  it('đủ tiền: trả đủ đúng hạn mọi khoản, không tốn thêm', () => {
    const p = plan(appendixA);
    expect(p.needFull).toBe(28467963);
    expect(p.lines.every((l) => l.onTime === l.full && l.later === 0)).toBe(true);
    expect(p.totalCost).toEqual({ min: 0, max: 0 });
    expect(p.leftover).toBe(7632037);
  });

  it('thiếu: tối thiểu + kỳ trả góp đúng hạn; tiền lương về sau hạn thẻ thì trả thêm VIB (lãi cao) trước', () => {
    const p = plan(withCash(5500000)); // cả tháng 20.000.000, phần bắt buộc 16.819.675
    expect(p.needMinimum).toBe(16819675);
    expect(p.minimumsCovered).toBe(true);
    expect(p.lines.filter((l) => !l.isCard).every((l) => l.onTime === l.full)).toBe(true);
    // Trước 09/11 chỉ có 5,5tr → không trả hẳn được sao kê VIB (cần 7,64tr); trả thêm sau khi lương về
    expect(line(p, 'Thẻ VIB')).toMatchObject({ onTime: 3570681, later: 3180325 });
    expect(line(p, 'Thẻ Sacombank')).toMatchObject({ onTime: 394560, later: 0 });
    expect(p.totalCost).toEqual({ min: 157824 + 187120, max: 251729 + 187120 });
    expect(p.leftover).toBe(0);
  });

  it('có đủ tiền trước 09/11 để trả hẳn sao kê VIB thì trả hẳn (không mất lãi)', () => {
    const p = plan(withCash(8000000)); // 8tr ≥ 394.560 + 7.246.783
    expect(line(p, 'Thẻ VIB')).toMatchObject({ onTime: 7246783, cost: { min: 0, max: 0 } });
    expect(line(p, 'Thẻ Sacombank')).toMatchObject({ onTime: 394560, later: 22500000 - 16819675 - 3676102 });
    expect(p.totalCost).toEqual({ min: 157824, max: 251729 });
  });

  it('chưa có tiền tới hạn thẻ: thẻ trễ, phí phạt; bù tối thiểu ngay khi lương về', () => {
    const p = plan(withCash(0)); // 14,5tr về 10/11, khoản vay 19/11 vẫn đủ
    expect(p.minimumsCovered).toBe(false);
    expect(p.lines.filter((l) => l.late).map((l) => l.label)).toEqual(['Thẻ Sacombank · Sao kê 10/10', 'Thẻ VIB · Sao kê 25/10']);
    expect(p.lines.filter((l) => !l.isCard).every((l) => l.onTime === l.full)).toBe(true);
    // còn 14.500.000 − 12.854.434 = 1.645.566: bù tối thiểu Sacombank (hạn sớm) rồi VIB
    expect(line(p, 'Thẻ Sacombank')).toMatchObject({ onTime: 0, later: 394560, cost: { min: 157824 + 200000, max: 251729 + 200000 } });
    expect(line(p, 'Thẻ VIB')).toMatchObject({ onTime: 0, later: 1251006, feeUnknown: true });
  });

  it('khoản vay trả không đủ thì để trễ hẳn khoản đó (trả thiếu vẫn là trễ), tính phí phạt đã nhập', () => {
    const s = withCash(0, 10000000);
    s.obligations = s.obligations.map((o) => (o.id === 'sac-3' ? { ...o, lateFee: { percent: 0.06, floor: 200000 } } : o));
    const p = plan(s);
    // sau Shinhan còn 4.898.566 cho 4 khoản ngày 19/11 (cần 7.753.000): VTD 1, 2, SFinance đủ; VTD 3 trễ
    expect(p.lines.filter((l) => !l.isCard && l.late).map((l) => l.label)).toEqual(['Vay tiêu dùng 3 · Kỳ 1/2']);
    expect(line(p, 'Vay tiêu dùng 3')).toMatchObject({ onTime: 0, cost: { min: 200000, max: 200000 }, feeUnknown: false });
  });

  it('áp dụng: số dự định = phần trả đúng hạn; dòng tiền hết thiếu, phần trả sau thành tiền còn lại', () => {
    const s = withCash(5500000);
    const sum = monthlySummary(s, '2026-11', today);
    const p = planForSummary(createEngine(s, today), sum);
    const planned = applyPlan({ 'sf-1:29': 1 }, p, sum.items);
    expect(planned['sf-1:29']).toBeUndefined();
    const s2 = { ...s, plannedAmounts: planned };
    const after = monthlySummary(s2, '2026-11', today);
    expect(after.cash.verdict).toBe('enough');
    expect(after.cash.leftover).toBe(3180325); // để trả thêm VIB sau khi lương về
    expect(planApplied(planForSummary(createEngine(s2, today), after), after.items)).toBe(true);
    expect(planApplied(p, sum.items)).toBe(false);
  });
});
