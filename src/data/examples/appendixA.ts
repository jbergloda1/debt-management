import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS } from '../../domain/defaults';
import type { DueDateRule, Obligation, ProfileState } from '../../domain/types';

const P = 'p-example';
const SAC_RULE: DueDateRule = { type: 'fixed_day', day: 19, cutoffDay: 19, offsetIfOnOrBeforeCutoff: 1, offsetIfAfterCutoff: 2 };
const base = { profileId: P, status: 'active' as const, createdAt: '2026-11-01' };
const opening = (periodsPaid: number) => ({ asOf: '2026-11-01', periodsPaid });
const sacLink = { parentObligationId: 'card-sac', creditLineId: 'cl-sac', sharesCreditLimit: true, billedIntoStatement: false };

const sacLoan = (id: string, name: string, startDate: string, principal: number, periods: number, monthlyRate: number, paid: number): Obligation => ({
  ...base,
  id,
  kind: 'installment_loan',
  institutionId: 'inst-sac',
  name,
  principal,
  startDate,
  periods,
  interestModel: { type: 'flat_monthly', monthlyRate },
  dueRule: SAC_RULE,
  link: sacLink,
  opening: opening(paid),
});

/**
 * Phụ lục A của spec v2 — tình huống thật (Excel) biểu diễn hoàn toàn bằng cấu hình.
 * Bổ sung so với phụ lục: sao kê, tài khoản tiền, thu nhập và scenario lấy từ dữ liệu v1.
 * vib-1 không có opening: "periodsPaid: 1" của phụ lục/v1 thực ra là "1 kỳ đã lên sao kê" (chưa trả) —
 * theo số liệu thật, hạn mức VIB còn lại là 5.866.059.
 */
export const appendixA: ProfileState = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  profile: {
    id: P,
    name: 'Ví dụ (Phụ lục A)',
    currency: 'VND',
    locale: 'vi-VN',
    settings: { ...DEFAULT_SETTINGS, defaultCardPaymentPolicy: 'current_balance', dueSoonThresholdDays: 5 },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  },
  institutions: [
    {
      id: 'inst-sac',
      name: 'Sacombank',
      type: 'bank',
      defaults: { dueDateRule: SAC_RULE, interestModel: { type: 'flat_monthly', monthlyRate: 0.012 } },
    },
    { id: 'inst-vib', name: 'VIB', type: 'bank' },
    {
      id: 'inst-shf',
      name: 'Shinhan Finance',
      type: 'finance_company',
      defaults: {
        perPeriodFee: [{ id: 'f1', name: 'Phí thu hộ', timing: 'per_period', amount: { type: 'fixed', value: 12000 } }],
      },
    },
    { id: 'inst-sf', name: 'SFinance', type: 'finance_company' },
  ],
  creditLines: [
    { id: 'cl-sac', institutionId: 'inst-sac', name: 'Hạn mức Thẻ Sacombank', limit: 30000000 },
    { id: 'cl-vib', institutionId: 'inst-vib', name: 'Hạn mức Thẻ VIB', limit: 28800000 },
  ],
  obligations: [
    {
      ...base,
      id: 'card-sac',
      kind: 'credit_card',
      institutionId: 'inst-sac',
      creditLineId: 'cl-sac',
      name: 'Thẻ Sacombank',
      statementDay: 10,
      dueRule: { type: 'statement_fixed_due', statementDay: 10, dueDay: 5 },
      annualRate: 0.3,
      paymentPolicy: 'current_balance',
    },
    {
      ...base,
      id: 'card-vib',
      kind: 'credit_card',
      institutionId: 'inst-vib',
      creditLineId: 'cl-vib',
      name: 'Thẻ VIB',
      statementDay: 25,
      dueRule: { type: 'statement_offset', statementDay: 25, daysAfterStatement: 15 },
      paymentPolicy: 'current_balance',
    },
    sacLoan('sac-1', 'Vay tiêu dùng 1', '2026-05-20', 8000000, 5, 0.012, 4),
    sacLoan('sac-2', 'Vay tiêu dùng 2', '2026-08-12', 6000000, 3, 0.012, 2),
    sacLoan('sac-3', 'Vay tiêu dùng 3', '2026-09-28', 6000000, 2, 0.012, 0),
    sacLoan('sac-4', 'Vay tiêu dùng 4', '2026-10-26', 6000000, 3, 0.0127, 0),
    {
      ...base,
      id: 'vib-1',
      kind: 'installment_loan',
      institutionId: 'inst-vib',
      name: 'Trả góp VIB',
      principal: 17648053,
      // Chuyển đổi 06/10 → kỳ 1/9 lên sao kê 25/10, trả cùng thẻ hạn 09/11 (sao kê + 15 ngày) (chưa trả kỳ nào)
      startDate: '2026-10-06',
      periods: 9,
      interestModel: { type: 'zero_interest' },
      dueRule: { type: 'statement_offset', statementDay: 25, daysAfterStatement: 15 },
      link: { parentObligationId: 'card-vib', creditLineId: 'cl-vib', sharesCreditLimit: true, billedIntoStatement: true },
    },
    {
      ...base,
      id: 'shf-1',
      kind: 'installment_loan',
      institutionId: 'inst-shf',
      name: 'Shinhan khoản 1',
      principal: 50000000,
      startDate: '2026-06-15',
      periods: 12,
      interestModel: { type: 'fixed_installment', installment: 5089434 },
      dueRule: { type: 'same_day_as_start', offsetMonths: 1 },
      opening: opening(4),
    },
    {
      ...base,
      id: 'shf-2',
      kind: 'installment_loan',
      institutionId: 'inst-shf',
      name: 'Shinhan khoản 2',
      principal: 20000000,
      netDisbursed: 18850000,
      startDate: '2026-11-15',
      periods: 12,
      interestModel: { type: 'fixed_installment', installment: 2059000 },
      dueRule: { type: 'same_day_as_start', offsetMonths: 1 },
      dueDateEstimated: true,
      note: 'Thực nhận ~18,8–18,9tr (bảo hiểm bị trừ). Đóng từ tháng 12, ngày 15 là tạm tính.',
    },
    {
      ...base,
      id: 'sf-1',
      kind: 'installment_loan',
      institutionId: 'inst-sf',
      name: 'SFinance',
      principal: 20000000,
      startDate: '2024-06-19',
      periods: 36,
      interestModel: { type: 'fixed_installment', installment: 913000 },
      dueRule: { type: 'same_day_as_start', offsetMonths: 1 },
      opening: opening(28),
    },
  ],
  statements: [
    {
      id: 'st-sac-2610',
      obligationId: 'card-sac',
      statementDate: '2026-10-10',
      dueDate: '2026-11-05',
      statementBalance: 7891193,
      currentBalance: 8366746,
      capturedAt: '2026-11-01',
    },
    {
      id: 'st-vib-2610',
      obligationId: 'card-vib',
      statementDate: '2026-10-25',
      dueDate: '2026-11-09',
      statementBalance: 7246783,
      currentBalance: 7246783,
      capturedAt: '2026-11-01',
    },
  ],
  payments: [],
  plannedAmounts: {},
  cashAccounts: [
    { id: 'acc-bank', name: 'Tài khoản ngân hàng', balance: 2000000, updatedAt: '2026-11-04' },
    { id: 'acc-cash', name: 'Tiền mặt', balance: 600000, updatedAt: '2026-11-04' },
    { id: 'acc-other', name: 'Nguồn khác', balance: 19000000, updatedAt: '2026-11-04' },
  ],
  incomes: [
    { id: 'inc-salary', name: 'Lương', amount: 14500000, recurrence: { type: 'monthly', day: 10, from: '2026-11' } },
  ],
  expenses: [],
  scenarios: [
    {
      id: 'scn-base',
      name: 'Cơ bản',
      horizonMonths: 12,
      assumeAllPaidOnTime: true,
      cardMonthlySpending: {},
      incomeOverrides: { '2026-12': 20000000 },
    },
  ],
  viewMonth: '2026-11',
};
