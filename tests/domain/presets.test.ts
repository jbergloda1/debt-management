import { describe, expect, it } from 'vitest';
import { builtinPresets, institutionFromPreset, presetFromInstitution } from '../../src/data/presets';
import { appendixA } from '../../src/data/examples/appendixA';
import { createEngine } from '../../src/domain/engine';
import { monthlySummary } from '../../src/domain/summary';
import { dueDateRuleSchema, interestModelSchema, profileStateSchema } from '../../src/domain/validation';
import type { InstallmentLoanObligation } from '../../src/domain/types';

describe('presets', () => {
  it('có preset và mọi quy tắc trong preset hợp lệ', () => {
    expect(builtinPresets.length).toBeGreaterThanOrEqual(4);
    for (const p of builtinPresets) {
      const d = p.institution.defaults ?? {};
      if (d.dueDateRule) expect(dueDateRuleSchema.safeParse(d.dueDateRule).success).toBe(true);
      if (d.interestModel) expect(interestModelSchema.safeParse(d.interestModel).success).toBe(true);
      for (const t of p.obligationTemplates) {
        const td = t.defaults as Partial<InstallmentLoanObligation>;
        if (td.dueRule) expect(dueDateRuleSchema.safeParse(td.dueRule).success).toBe(true);
        if (td.interestModel) expect(interestModelSchema.safeParse(td.interestModel).success).toBe(true);
      }
    }
  });

  it('fixture: khoản vay tạo từ mỗi preset chạy được qua engine', () => {
    for (const p of builtinPresets) {
      const inst = institutionFromPreset(p);
      const loans = p.obligationTemplates
        .filter((t) => t.kind === 'installment_loan')
        .map(
          (t, i): InstallmentLoanObligation => ({
            id: `l${i}`,
            profileId: appendixA.profile.id,
            institutionId: inst.id,
            kind: 'installment_loan',
            name: t.label,
            status: 'active',
            createdAt: '2026-11-01',
            principal: 12_000_000,
            startDate: '2026-11-01',
            periods: 12,
            interestModel: { type: 'zero_interest' },
            dueRule: { type: 'same_day_as_start' },
            ...(t.defaults as Partial<InstallmentLoanObligation>),
            link: undefined,
          }),
        )
        .map((l) => (l.interestModel.type === 'fixed_installment' ? { ...l, interestModel: { type: 'fixed_installment' as const, installment: 1_200_000 } } : l));
      const state = { ...appendixA, institutions: [inst], creditLines: [], statements: [], obligations: loans };
      expect(profileStateSchema.safeParse(state).success).toBe(true);
      const e = createEngine(state, '2026-11-04');
      for (const l of loans) expect(e.schedule(l).reduce((s, r) => s + r.principal, 0)).toBe(12_000_000);
      expect(() => monthlySummary(e, '2026-12')).not.toThrow();
    }
  });

  it('xuất preset không mang id/ghi chú cá nhân', () => {
    const p = presetFromInstitution({ ...appendixA.institutions[2], note: 'riêng tư' });
    expect(JSON.stringify(p)).not.toContain('riêng tư');
    expect(JSON.stringify(p)).not.toContain('inst-shf');
    expect(p.institution.defaults?.perPeriodFee?.[0].amount).toEqual({ type: 'fixed', value: 12000 });
  });
});
