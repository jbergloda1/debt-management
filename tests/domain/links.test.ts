import { describe, expect, it } from 'vitest';
import { appendixA } from '../../src/data/examples/appendixA';
import { alerts, creditLineUsage, monthlySummary } from '../../src/domain';
import { repairLinks } from '../../src/domain/links';
import { migrate } from '../../src/domain/migrations';
import type { InstallmentLoanObligation, ProfileState } from '../../src/domain/types';
import { validateObligation } from '../../src/domain/validation';

const today = '2026-11-04';

/**
 * Dữ liệu như khi tạo bằng mẫu preset ở bản trước: hạn mức mang tên mẫu, trả góp VIB tạo từ mẫu
 * "Trả góp chuyển đổi" (có link nhưng không gắn thẻ) và nằm ở một tổ chức khác tạo lần hai từ preset.
 */
const fromTemplates: ProfileState = {
  ...appendixA,
  schemaVersion: 1,
  institutions: [...appendixA.institutions, { id: 'inst-preset', name: 'Ngân hàng (trả góp qua thẻ)', type: 'bank' }],
  creditLines: [
    { id: 'cl-sac', institutionId: 'inst-sac', name: 'Hạn mức Thẻ tín dụng (sao kê 10, đến hạn 5 tháng sau)', limit: 30000000 },
    { id: 'cl-vib', institutionId: 'inst-vib', name: 'Hạn mức Thẻ tín dụng (sao kê 25, đến hạn 10 tháng sau)', limit: 28800000 },
  ],
  obligations: appendixA.obligations.map((o) =>
    o.id === 'vib-1' ? { ...o, institutionId: 'inst-preset', link: { sharesCreditLimit: true, billedIntoStatement: true } } : o,
  ),
};

describe('trả góp tạo từ mẫu preset (thiếu thẻ)', () => {
  it('lỗi cũ: không trừ hạn mức, còn cộng riêng vào phải trả, có cảnh báo', () => {
    expect(creditLineUsage(fromTemplates, 'cl-vib', today)!.available).toBe(28800000 - 7246783);
    expect(monthlySummary(fromTemplates, '2026-11', today).totals.payable).toBe(28467963 + 1960895);
    expect(alerts(fromTemplates, today).filter((a) => a.code === 'LINK_MISSING_CARD').map((a) => a.obligationId)).toEqual(['vib-1']);
  });

  it('migration gắn lại thẻ VIB (cùng chu kỳ 25/10) và đặt tên hạn mức theo thẻ', () => {
    const { state, from } = migrate(structuredClone(fromTemplates));
    expect(from).toBe(1);
    expect(state.creditLines.map((l) => l.name)).toEqual(['Hạn mức Thẻ Sacombank', 'Hạn mức Thẻ VIB']);
    const vib = state.obligations.find((o) => o.id === 'vib-1') as InstallmentLoanObligation;
    expect(vib.link).toEqual({ parentObligationId: 'card-vib', creditLineId: 'cl-vib', sharesCreditLimit: true, billedIntoStatement: true });
    expect(creditLineUsage(state, 'cl-vib', today)!.available).toBe(5866059);
    expect(monthlySummary(state, '2026-11', today).totals.payable).toBe(28467963);
    expect(alerts(state, today).some((a) => a.code === 'LINK_MISSING_CARD')).toBe(false);
  });

  it('mơ hồ (hai thẻ cùng chu kỳ) thì không đoán, để cảnh báo', () => {
    const twoCards: ProfileState = {
      ...fromTemplates,
      obligations: fromTemplates.obligations.map((o) =>
        o.id === 'card-sac' && o.kind === 'credit_card' ? { ...o, dueRule: { type: 'statement_fixed_due', statementDay: 25, dueDay: 10 } } : o,
      ),
    };
    const { state, attached } = repairLinks(twoCards);
    expect(attached).toEqual([]);
    expect(alerts(state, today).filter((a) => a.code === 'LINK_MISSING_CARD')).toHaveLength(1);
  });

  it('form bắt chọn thẻ khi khoản nằm trong sao kê', () => {
    const vib = fromTemplates.obligations.find((o) => o.id === 'vib-1')!;
    expect(validateObligation(vib, today).join()).toMatch(/hãy chọn thẻ ở "Gắn vào thẻ"/);
    const ok = appendixA.obligations.find((o) => o.id === 'vib-1')!;
    expect(validateObligation(ok, today)).toEqual([]);
  });
});
