import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { monthlySummary, project } from '../../src/domain';
import { v1Seed } from '../../src/domain/legacy/v1';
import { migrate } from '../../src/domain/migrations';

const today = '2026-11-04';

describe('migration', () => {
  it('dữ liệu app v1 → v2 cho cùng kết quả như spec v1', () => {
    const { state, from } = migrate(JSON.parse(JSON.stringify(v1Seed)));
    expect(from).toBe('legacy-v1');
    const sum = monthlySummary(state, '2026-11', today);
    expect(sum.totals.payable).toBe(28467963);
    expect(sum.totals.debt).toBe(119868159);
    expect(sum.rows.find((r) => r.label === 'Thẻ VIB')!.children.map((c) => c.label)).toEqual(['Kỳ 1/9']);
    expect(sum.cash.leftover).toBe(7632037);
    const p = project(state, state.scenarios[0], '2026-12', today);
    expect(p.months[0].outflow).toBe(15194529);
    expect(p.months[0].leftover).toBe(4805471);
  });

  it('v1 có đánh dấu đã trả → sinh payment tương ứng', () => {
    const v1 = { ...v1Seed, sacombankLoansPaidThisMonth: true, cards: v1Seed.cards.map((c) => ({ ...c, paid: true })) };
    const { state } = migrate(JSON.parse(JSON.stringify(v1)));
    const sum = monthlySummary(state, '2026-11', today);
    expect(sum.totals.unpaid).toBe(5101434 + 913000);
  });

  it('dữ liệu hiện hành đi qua migrate không đổi; dữ liệu hỏng bị từ chối', () => {
    expect(migrate(structuredClone(appendixA)).state).toEqual(appendixA);
    expect(() => migrate({ ...appendixA, viewMonth: 'tháng 11' })).toThrow(/viewMonth/);
    expect(() => migrate({ ...appendixA, schemaVersion: 99 })).toThrow(/mới hơn/);
  });

  it('dữ liệu schemaVersion 0 được bổ sung mặc định', () => {
    const old: any = structuredClone(appendixA);
    old.schemaVersion = 0;
    delete old.plannedAmounts;
    delete old.profile.settings.groupByDate;
    const { state, from } = migrate(old);
    expect(from).toBe(0);
    expect(state.plannedAmounts).toEqual({});
    expect(state.profile.settings.groupByDate).toBe(false);
  });
});
