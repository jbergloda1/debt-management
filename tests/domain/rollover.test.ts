import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { createEngine } from '../../src/domain/engine';
import { applyRollover, defaultPayment, defaultTarget, planRollover, type RolloverInput } from '../../src/domain/rollover';
import { monthlySummary } from '../../src/domain/summary';

const today = '2026-12-02';
let seq = 0;
const newId = (p: string) => `${p}-${++seq}`;

describe('sang tháng mới', () => {
  it('tháng đích', () => {
    expect(defaultTarget('2026-11', '2026-12-02')).toBe('2026-12');
    expect(defaultTarget('2026-11', '2026-11-20')).toBe('2026-12');
    expect(defaultTarget('2026-10', '2026-12-02')).toBe('2026-12');
  });

  const engine = createEngine(appendixA, today);
  const plan = planRollover(engine, '2026-12');

  it('liệt kê khoản tháng trước chưa trả (không gồm kỳ nằm trong sao kê)', () => {
    expect(plan.openItems.map((i) => i.obligationId)).toEqual(['card-sac', 'card-vib', 'shf-1', 'sac-1', 'sac-2', 'sac-3', 'sf-1']);
    expect(defaultPayment(plan.openItems[1], today)).toEqual({ amount: 7246783, date: '2026-11-09' });
  });

  it('dự kiến ngày sao kê mới và các kỳ trả góp đã gộp', () => {
    expect(plan.cards.map((c) => [c.obligationId, c.statementDate, c.dueDate, c.existing])).toEqual([
      ['card-sac', '2026-11-10', '2026-12-05', undefined],
      ['card-vib', '2026-11-25', '2026-12-10', undefined],
    ]);
    expect(plan.cards[1].billed).toEqual([{ obligationId: 'vib-1', label: 'Trả góp VIB kỳ 2/9', amount: 1960895 }]);
  });

  it('áp dụng: trả hết tháng 11, sao kê tháng 12, cập nhật tiền', () => {
    const input: RolloverInput = {
      target: '2026-12',
      payments: plan.openItems.map((it) => ({ itemKey: it.key, obligationId: it.obligationId, ...defaultPayment(it, today) })),
      statements: [
        { obligationId: 'card-sac', statementDate: '2026-11-10', dueDate: '2026-12-05', statementBalance: 5000000, currentBalance: 5000000 },
        { obligationId: 'card-vib', statementDate: '2026-11-25', dueDate: '2026-12-10', statementBalance: 4000000, currentBalance: 4500000 },
      ],
      cash: [{ id: 'acc-bank', balance: 10000000 }],
    };
    const next = applyRollover(appendixA, input, today, newId);
    expect(next.viewMonth).toBe('2026-12');
    expect(appendixA.payments).toEqual([]); // không đổi state cũ

    const e = createEngine(next, today);
    expect(planRollover(e, '2026-12').openItems).toEqual([]);
    const sum = monthlySummary(e, '2026-12');
    // 5.000.000 + 4.500.000 + vay Sacombank (3.072.000 + 2.076.200) + Shinhan 1 + Shinhan 2 + SFinance
    expect(sum.totals.payable).toBe(5000000 + 4500000 + 5148200 + 5101434 + 2071000 + 913000);
    const vib = sum.rows.find((r) => r.obligationId === 'card-vib')!;
    expect(vib.children.map((c) => c.label)).toEqual(['Kỳ 2/9']);
    expect(vib.debtRemaining).toBe(4500000 + (17648053 - 2 * 1960895));
    expect(sum.totals.debt).toBe(5000000 + 9000000 + 18226263 + 7 * 5101434 + 12 * 2071000 + 7 * 913000);
    expect(next.cashAccounts.find((a) => a.id === 'acc-bank')).toMatchObject({ balance: 10000000, updatedAt: today });
    expect(next.cashAccounts.find((a) => a.id === 'acc-cash')!.updatedAt).toBe('2026-11-04');
  });

  it('đã có sao kê kỳ này thì đánh dấu existing', () => {
    const withStmt = {
      ...appendixA,
      statements: [...appendixA.statements, { id: 'x', obligationId: 'card-sac', statementDate: '2026-11-10', dueDate: '2026-12-05', statementBalance: 1, currentBalance: 1, capturedAt: today }],
    };
    expect(planRollover(createEngine(withStmt, today), '2026-12').cards[0].existing?.id).toBe('x');
  });
});
