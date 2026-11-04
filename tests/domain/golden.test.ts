import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { alerts, creditLineUsage, loanMetrics, monthlySummary, project } from '../../src/domain';
import { createEngine } from '../../src/domain/engine';
import type { InstallmentLoanObligation, ProfileState } from '../../src/domain/types';

// Golden test: Phụ lục A, today = 2026-11-04 — cùng số liệu với spec v1
const today = '2026-11-04';
const s = appendixA;
const loan = (id: string) => s.obligations.find((o) => o.id === id) as InstallmentLoanObligation;
const inst = (id: string) => s.institutions.find((i) => i.id === id);

describe('Phụ lục A — tháng 11/2026', () => {
  const sum = monthlySummary(s, '2026-11', today);
  const row = (id: string) => sum.rows.find((r) => r.obligationId === id)!;

  it('tổng phải trả & tổng dư nợ', () => {
    expect(sum.totals.payable).toBe(28467963);
    expect(sum.totals.debt).toBe(119868159); // 117.907.264 của spec v1 thiếu 1 kỳ VIB
  });

  it('từng dòng', () => {
    expect(row('card-sac')).toMatchObject({ amount: 8366746, debtRemaining: 8366746, state: 'due_soon', dueDate: '2026-11-04' });
    expect(row('card-vib')).toMatchObject({ amount: 7246783, debtRemaining: 22933941, dueDate: '2026-11-09' });
    expect(row('card-vib').children.map((c) => [c.obligationId, c.label, c.amount])).toEqual([['vib-1', 'Kỳ 1/9', 1960895]]);
    expect(['sac-1', 'sac-2', 'sac-3'].map((id) => row(id).amount)).toEqual([1696000, 2072000, 3072000]);
    expect(row('sac-4')).toMatchObject({ amount: 0, state: 'not_yet', dueDate: '2026-12-19' });
    expect(['sac-1', 'sac-2', 'sac-3', 'sac-4'].reduce((t, id) => t + row(id).debtRemaining, 0)).toBe(15600000);
    expect(row('shf-1')).toMatchObject({ amount: 5101434, debtRemaining: 40811472 });
    expect(row('shf-2')).toMatchObject({ amount: 0, state: 'not_yet', debtRemaining: 24852000 });
    expect(row('sf-1')).toMatchObject({ amount: 913000, debtRemaining: 7304000 });
    expect(sum.rows.find((r) => r.obligationId === 'vib-1')).toBeUndefined(); // không đếm trùng (P6)
  });

  it('kỳ hiện tại của các khoản vay Sacombank', () => {
    const items = sum.items.filter((i) => i.obligationId.startsWith('sac-'));
    expect(items.map((i) => [i.obligationId, i.label])).toEqual([
      ['sac-1', 'Kỳ 5/5'],
      ['sac-2', 'Kỳ 3/3'],
      ['sac-3', 'Kỳ 1/2'],
    ]);
  });

  it('hạn mức khả dụng', () => {
    const sac = creditLineUsage(s, 'cl-sac', today)!;
    const vib = creditLineUsage(s, 'cl-vib', today)!;
    expect(sac.available).toBe(6033254);
    expect(vib.available).toBe(5866059);
    expect(sac.utilization.toFixed(3)).toBe('0.799');
    expect(vib.utilization.toFixed(3)).toBe('0.796');
  });

  it('Shinhan khoản 2: APR danh nghĩa / thực tế', () => {
    const m = loanMetrics(loan('shf-2'), inst('inst-shf'), s.profile.settings);
    expect((m.nominalAPR * 100).toFixed(1)).toBe('40.9');
    expect((m.effectiveAPR * 100).toFixed(1)).toBe('54.4');
  });

  it('dòng tiền: đủ tiền, còn lại 7.632.037', () => {
    expect(sum.cash.available).toBe(36100000);
    expect(sum.cash.leftover).toBe(7632037);
    expect(sum.cash.verdict).toBe('enough');
  });

  it('cảnh báo', () => {
    const codes = alerts(s, today).map((a) => `${a.code}:${a.obligationId ?? a.creditLineId ?? ''}`);
    expect(codes).toContain('DUE_SOON:card-sac');
    expect(codes).toContain('HIGH_UTILIZATION:cl-sac');
    expect(codes).toContain('HIGH_APR:shf-2');
    expect(codes).toContain('ESTIMATED_DATE:shf-2');
    expect(codes.filter((c) => c.startsWith('PERIOD_MISMATCH'))).toEqual([]);
    expect(codes.filter((c) => c.startsWith('CASH_SHORT'))).toEqual([]);
  });
});

describe('Phụ lục A — dự phóng tháng 12/2026', () => {
  const p = project(s, s.scenarios[0], '2026-12', today);
  const dec = p.months[0];

  it('tổng phải trả 15.194.529, còn lại 4.805.471', () => {
    expect(dec.outflow).toBe(15194529);
    expect(dec.leftover).toBe(4805471);
    expect(dec.cards).toBe(1960895);
    expect(dec.installments).toBe(5148200 + 5101434 + 2071000 + 913000);
  });

  it('mốc hết nợ', () => {
    expect(dec.payoffs.map((x) => x.obligationId)).toEqual(['sac-3']);
    expect(p.debtFreeDate).toBe('2027-11-15'); // Shinhan khoản 2 kỳ 12
  });
});

describe('VIB: trả góp chuyển đổi 06/10 gộp vào sao kê (số liệu thật)', () => {
  // Hạn mức 28.800.000, còn 5.866.059. Trả góp 17.648.053 / 9 kỳ, kỳ 1 (1.960.895) lên sao kê 25/10.
  // Kỳ 09/11 (sao kê 25/10 + 15 ngày) trả thẻ 7.246.783 = chi tiêu + kỳ 1/9.
  const sum = monthlySummary(s, '2026-11', today);
  const vib = sum.rows.find((r) => r.obligationId === 'card-vib')!;

  it('tháng 11 là kỳ 1/9, nằm trong số phải trả của thẻ, không cộng riêng', () => {
    expect(vib.amount).toBe(7246783);
    expect(vib.children.map((c) => [c.label, c.amount, c.dueDate])).toEqual([['Kỳ 1/9', 1960895, '2026-11-09']]);
  });

  it('dư nợ = dư nợ hiện tại + gốc kỳ 2–9 chưa lên sao kê; hạn mức còn 5.866.059', () => {
    expect(vib.debtRemaining).toBe(7246783 + 15687158);
    const u = creditLineUsage(s, 'cl-vib', today)!;
    expect(u.breakdown.map((b) => [b.obligationId, b.amount])).toEqual([
      ['card-vib', 7246783],
      ['vib-1', 15687158],
    ]);
    expect(u.available).toBe(5866059);
  });

  it('không có cảnh báo lệch số kỳ', () => {
    expect(alerts(s, today).filter((a) => a.obligationId === 'vib-1')).toEqual([]);
  });
});

describe('Payment ledger', () => {
  const pay = (state: ProfileState, obligationId: string, dueItemKey: string, amount: number): ProfileState => ({
    ...state,
    payments: [...state.payments, { id: `p${state.payments.length}`, obligationId, dueItemKey, date: today, amount }],
  });

  it('trả đủ sao kê VIB → kỳ trả góp gộp sao kê cũng được tính đã trả', () => {
    const st = pay(s, 'card-vib', 'card-vib:st-vib-2610', 7246783);
    const e = createEngine(st, today);
    expect(e.ledger(loan('vib-1')).periodsPaid).toBe(1);
    const sum = monthlySummary(st, '2026-11', today);
    const vibRow = sum.rows.find((r) => r.obligationId === 'card-vib')!;
    expect(vibRow.state).toBe('paid');
    expect(vibRow.children[0].state).toBe('paid');
    expect(vibRow.debtRemaining).toBe(15687158); // chỉ còn gốc kỳ 2–9 chưa lên sao kê
    expect(sum.totals.unpaid).toBe(28467963 - 7246783);
    expect(creditLineUsage(st, 'cl-vib', today)!.available).toBe(28800000 - 15687158);
  });

  it('trả một phần → partial; trả không gắn kỳ → phân bổ FIFO', () => {
    let st = pay(s, 'shf-1', 'shf-1:5', 1000000);
    expect(monthlySummary(st, '2026-11', today).rows.find((r) => r.obligationId === 'shf-1')!.state).toBe('partial');
    st = { ...st, payments: [...st.payments, { id: 'x', obligationId: 'shf-1', date: today, amount: 4101434 + 5101434 }] };
    const led = createEngine(st, today).ledger(loan('shf-1'));
    expect(led.periodsPaid).toBe(6);
    expect(led.remainingPayments).toBe(6 * 5101434);
  });
});
