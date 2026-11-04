import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addMonths, formatShortDate, formatYM, shiftBusinessDay } from '../../src/domain/dates';
import { validateObligation } from '../../src/domain/validation';
import { irr, pmt, rate } from '../../src/domain/finance';
import { buildSchedule } from '../../src/domain/schedule';
import { generateDueDates } from '../../src/domain/rules';
import type { DueDateRule, InstallmentLoanObligation, InterestModel } from '../../src/domain/types';

const settings = { weekendShift: 'none' as const, holidays: [] };
const loan = (o: Partial<InstallmentLoanObligation>): InstallmentLoanObligation => ({
  id: 'l',
  profileId: 'p',
  institutionId: 'i',
  kind: 'installment_loan',
  name: 'L',
  status: 'active',
  createdAt: '2026-01-01',
  principal: 10_000_000,
  startDate: '2026-01-15',
  periods: 12,
  interestModel: { type: 'zero_interest' },
  dueRule: { type: 'same_day_as_start' },
  ...o,
});

describe('dates', () => {
  it('EDATE & biên', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-19', 1)).toBe('2027-01-19');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });
  it('định dạng tháng / ngày ngắn', () => {
    expect(formatYM('2026-11')).toBe('11/2026');
    expect(formatShortDate('2026-10-05')).toBe('05/10');
    expect(formatShortDate('2026-10-05', 'en-US')).toBe('10/05');
  });
  it('dời ngày nghỉ', () => {
    expect(shiftBusinessDay('2026-11-07', 'next_business_day')).toBe('2026-11-09'); // T7 → T2
    expect(shiftBusinessDay('2026-11-08', 'previous_business_day')).toBe('2026-11-06'); // CN → T6
    expect(shiftBusinessDay('2026-11-09', 'next_business_day', ['2026-11-09'])).toBe('2026-11-10');
  });
});

describe('quy tắc ngày đến hạn', () => {
  const fixed: DueDateRule = { type: 'fixed_day', day: 19, cutoffDay: 19, offsetIfOnOrBeforeCutoff: 1, offsetIfAfterCutoff: 2 };
  it('fixed_day: cutoff', () => {
    expect(generateDueDates(fixed, '2026-08-12', 1)).toEqual(['2026-09-19']);
    expect(generateDueDates(fixed, '2026-05-20', 2)).toEqual(['2026-07-19', '2026-08-19']);
    expect(generateDueDates(fixed, '2026-05-19', 1)).toEqual(['2026-06-19']); // đúng bằng cutoff
  });
  it('same_day_as_start giữ ngày 31', () => {
    expect(generateDueDates({ type: 'same_day_as_start' }, '2026-01-31', 3)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('statement_fixed_due / statement_offset', () => {
    expect(generateDueDates({ type: 'statement_fixed_due', statementDay: 25, dueDay: 10 }, '2026-09-06', 3)).toEqual([
      '2026-10-10',
      '2026-11-10',
      '2026-12-10',
    ]);
    expect(generateDueDates({ type: 'statement_fixed_due', statementDay: 5, dueDay: 25 }, '2026-09-06', 1)).toEqual(['2026-10-25']);
    expect(generateDueDates({ type: 'statement_offset', statementDay: 10, daysAfterStatement: 25 }, '2026-10-01', 2)).toEqual([
      '2026-11-04',
      '2026-12-05',
    ]);
  });
  it('explicit / every_n_days', () => {
    expect(generateDueDates({ type: 'explicit', dates: ['2026-03-01', '2026-02-01'] }, '2026-01-01', 5)).toEqual(['2026-02-01', '2026-03-01']);
    expect(generateDueDates({ type: 'every_n_days', n: 30, anchor: '2026-01-01' }, '2026-01-01', 2)).toEqual(['2026-01-31', '2026-03-02']);
  });
});

describe('hàm tài chính (so với Excel)', () => {
  it('RATE / PMT', () => {
    expect(rate(12, 2059000, 20000000) * 12).toBeCloseTo(0.409465, 5); // Excel: =RATE(12;2059000;-20000000)*12
    expect(pmt(0.01, 12, 1000)).toBeCloseTo(88.8488, 3);
    expect(rate(12, pmt(0.015, 12, 5e7), 5e7)).toBeCloseTo(0.015, 10);
    expect(rate(10, 100, 1000)).toBe(0);
  });
  it('IRR fallback bisection với lãi rất cao', () => {
    expect(irr(100, [300])).toBeCloseTo(2, 6);
  });
});

describe('mô hình lãi', () => {
  it('reducing_balance: trả đều, dồn lẻ kỳ cuối', () => {
    const rows = buildSchedule(loan({ interestModel: { type: 'reducing_balance', annualRate: 0.24 } }), undefined, settings);
    const p = Math.round(pmt(0.02, 12, 10_000_000));
    expect(rows.slice(0, 11).every((r) => r.total === p)).toBe(true);
    expect(rows[0].interest).toBe(200000);
    expect(rows[11].principalRemainingAfter).toBe(0);
  });
  it('reducing_equal_principal: lãi giảm dần', () => {
    const rows = buildSchedule(loan({ interestModel: { type: 'reducing_equal_principal', annualRate: 0.12 } }), undefined, settings);
    expect(rows[0].interest).toBe(100000);
    expect(rows[1].interest).toBeLessThan(rows[0].interest);
  });
  it('fixed_installment: mọi kỳ đúng bằng số tiền hợp đồng', () => {
    const rows = buildSchedule(loan({ interestModel: { type: 'fixed_installment', installment: 913000 }, periods: 36, principal: 20e6 }), undefined, settings);
    expect(rows.every((r) => r.total === 913000)).toBe(true);
  });
  it('phí mỗi kỳ & theo phần trăm', () => {
    const rows = buildSchedule(
      loan({
        perPeriodFees: [
          { id: 'a', name: 'Thu hộ', timing: 'per_period', amount: { type: 'fixed', value: 12000 }, appliesToPeriod: 2 },
          { id: 'b', name: 'BH', timing: 'per_period', amount: { type: 'percent_of_principal', rate: 0.001 } },
        ],
      }),
      undefined,
      settings,
    );
    expect(rows.map((r) => r.fees).slice(0, 3)).toEqual([22000, 22000, 10000]);
  });
});

describe('kiểm tra nhập liệu', () => {
  const today = '2026-11-04';
  it('chặn số tiền mỗi kỳ không đủ trả gốc, tiền thực nhận > gốc, last4 sai', () => {
    expect(validateObligation(loan({ interestModel: { type: 'fixed_installment', installment: 500_000 } }), today).join()).toMatch(/mỗi kỳ × số kỳ/);
    expect(validateObligation(loan({ netDisbursed: 11_000_000 }), today).join()).toMatch(/thực nhận/);
    expect(validateObligation(loan({ periods: 0 }), today).join()).toMatch(/Số kỳ/);
    expect(validateObligation(loan({ startDate: '2028-01-01' }), today).join()).toMatch(/1 năm/);
    expect(validateObligation(loan({}), today)).toEqual([]);
    const card = {
      id: 'c', profileId: 'p', institutionId: 'i', kind: 'credit_card' as const, name: 'C', status: 'active' as const,
      createdAt: today, creditLineId: 'l', statementDay: 10, dueRule: { type: 'statement_fixed_due' as const, statementDay: 10, dueDay: 5 }, last4: '12a4',
    };
    expect(validateObligation(card, today).join()).toMatch(/last4/);
  });
});

describe('thuộc tính (property tests)', () => {
  const model = fc.oneof(
    fc.record({ type: fc.constant('flat_monthly' as const), monthlyRate: fc.double({ min: 0, max: 0.05, noNaN: true }) }),
    fc.record({ type: fc.constant('reducing_balance' as const), annualRate: fc.double({ min: 0.001, max: 0.8, noNaN: true }) }),
    fc.record({ type: fc.constant('reducing_equal_principal' as const), annualRate: fc.double({ min: 0, max: 0.8, noNaN: true }) }),
    fc.constant({ type: 'zero_interest' as const }),
  ) as fc.Arbitrary<InterestModel>;

  it('Σ gốc = principal, dư nợ không âm', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2e9 }), fc.integer({ min: 1, max: 60 }), model, (principal, periods, interestModel) => {
        const rows = buildSchedule(loan({ principal, periods, interestModel }), undefined, settings);
        expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(principal);
        expect(rows.every((r) => r.principalRemainingAfter >= 0 && r.principal >= 0 && r.interest >= 0)).toBe(true);
        expect(rows.every((r) => Number.isInteger(r.total))).toBe(true);
      }),
    );
  });

  it('fixed_installment: Σ gốc = principal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1e6, max: 1e9 }), fc.integer({ min: 2, max: 48 }), fc.double({ min: 0.001, max: 0.06, noNaN: true }), (P, N, r) => {
        const installment = Math.ceil(pmt(r, N, P));
        const rows = buildSchedule(loan({ principal: P, periods: N, interestModel: { type: 'fixed_installment', installment } }), undefined, settings);
        expect(rows.reduce((s, x) => s + x.principal, 0)).toBe(P);
        expect(rows.every((x) => x.principalRemainingAfter >= 0)).toBe(true);
      }),
    );
  });
});
