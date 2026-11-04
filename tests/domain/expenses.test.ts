import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { monthlySummary, project } from '../../src/domain';
import { expenseOccurrences } from '../../src/domain/cashflow';
import { migrate } from '../../src/domain/migrations';
import type { ExpenseEntry, ProfileState } from '../../src/domain/types';

const today = '2026-11-04';
const expenses: ExpenseEntry[] = [
  { id: 'rent', name: 'Tiền nhà', category: 'housing', amount: 4000000, recurrence: { type: 'monthly', day: 5 } },
  { id: 'food', name: 'Ăn uống', category: 'food', amount: 3000000, recurrence: { type: 'monthly', day: 1 } },
  { id: 'car', name: 'Sửa xe', category: 'transport', amount: 1500000, recurrence: { type: 'once', date: '2026-11-20' } },
  { id: 'old', name: 'Đã chi đầu tháng', category: 'other', amount: 999000, recurrence: { type: 'once', date: '2026-11-02' } },
];
const withExpenses: ProfileState = { ...appendixA, expenses };

describe('chi tiêu', () => {
  it('phát sinh theo tháng: hàng tháng, một lần, giới hạn từ/đến', () => {
    expect(expenseOccurrences(expenses, '2026-12').map((e) => [e.name, e.date])).toEqual([
      ['Ăn uống', '2026-12-01'],
      ['Tiền nhà', '2026-12-05'],
    ]);
    const limited: ExpenseEntry = { ...expenses[0], recurrence: { type: 'monthly', day: 31, from: '2027-01', to: '2027-02' } };
    expect(expenseOccurrences([limited], '2026-12')).toEqual([]);
    expect(expenseOccurrences([limited], '2027-02')[0].date).toBe('2027-02-28');
  });

  it('tháng hiện tại: trừ chi tiêu từ hôm nay trở đi (đã chi trước đó coi như đã nằm trong số dư)', () => {
    const { cash, totals } = monthlySummary(withExpenses, '2026-11', today);
    // Tiền nhà 05/11 + Sửa xe 20/11; Ăn uống 01/11 và khoản 02/11 đã qua
    expect(cash.expensesExpected).toBe(4000000 + 1500000);
    expect(cash.debtOutflow).toBe(28467963);
    expect(cash.leftover).toBe(7632037 - 5500000);
    expect(totals.payable).toBe(28467963); // phải trả nợ không đổi
    expect(cash.verdict).toBe('enough');
    const rent = cash.timeline.find((e) => e.label === 'Tiền nhà')!;
    expect(rent).toMatchObject({ date: '2026-11-05', kind: 'expense', delta: -4000000 });
  });

  it('thiếu tiền: biết ngày bắt đầu âm (chi tiêu cùng ngày với thẻ, trước ngày lương)', () => {
    const tight: ProfileState = {
      ...withExpenses,
      cashAccounts: [{ id: 'a', name: 'TK', balance: 10000000, updatedAt: today }],
    };
    const { cash } = monthlySummary(tight, '2026-11', today);
    // 10tr − thẻ Sacombank 8.366.746 (05/11) − tiền nhà 4tr (05/11) < 0 trước khi lương về 10/11
    expect(cash.verdict).toBe('short');
    expect(cash.shortDate).toBe('2026-11-05');
  });

  it('dự phóng trừ chi tiêu mỗi tháng', () => {
    const p = project(withExpenses, withExpenses.scenarios[0], '2026-12', today);
    expect(p.months[0]).toMatchObject({ outflow: 15194529, expenses: 7000000, leftover: 4805471 - 7000000 });
    expect(p.firstShortMonth).toBe('2026-12');
  });

  it('dữ liệu cũ (schema 2) được thêm danh sách chi tiêu rỗng', () => {
    const old: any = structuredClone(appendixA);
    old.schemaVersion = 2;
    delete old.expenses;
    const { state, from } = migrate(old);
    expect(from).toBe(2);
    expect(state.expenses).toEqual([]);
  });
});
