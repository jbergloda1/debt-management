import { z } from 'zod';
import { addMonths } from './dates';
import type { ISODate, Obligation } from './types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD');
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, 'Tháng phải có dạng YYYY-MM');
const money = z.number().int('Số tiền phải là số nguyên').nonnegative('Số tiền phải ≥ 0');
const rate = z.number().nonnegative();
const day = z.number().int().min(1).max(31);
const id = z.string().min(1);

const policy = z.union([
  z.enum(['current_balance', 'statement_balance', 'minimum']),
  z.object({ type: z.literal('fixed'), amount: money }),
]);
const weekendShift = z.enum(['none', 'next_business_day', 'previous_business_day']);

export const dueDateRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fixed_day'), day, cutoffDay: day, offsetIfOnOrBeforeCutoff: z.number().int(), offsetIfAfterCutoff: z.number().int() }),
  z.object({ type: z.literal('same_day_as_start'), offsetMonths: z.number().int().optional() }),
  z.object({ type: z.literal('statement_offset'), statementDay: day, daysAfterStatement: z.number().int().nonnegative() }),
  z.object({ type: z.literal('statement_fixed_due'), statementDay: day, dueDay: day }),
  z.object({ type: z.literal('explicit'), dates: z.array(isoDate).min(1) }),
  z.object({ type: z.literal('every_n_days'), n: z.number().int().positive(), anchor: isoDate }),
]);

export const interestModelSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('flat_monthly'), monthlyRate: rate }),
  z.object({ type: z.literal('reducing_balance'), annualRate: rate }),
  z.object({ type: z.literal('reducing_equal_principal'), annualRate: rate }),
  z.object({ type: z.literal('fixed_installment'), installment: money }),
  z.object({ type: z.literal('zero_interest') }),
  z.object({ type: z.literal('custom_schedule'), rows: z.array(z.object({ principal: money, interest: money })) }),
]);

export const feeRuleSchema = z.object({
  id,
  name: z.string(),
  timing: z.enum(['per_period', 'upfront_deducted', 'upfront_paid', 'one_time']),
  amount: z.discriminatedUnion('type', [
    z.object({ type: z.literal('fixed'), value: money }),
    z.object({ type: z.literal('percent_of_principal'), rate }),
    z.object({ type: z.literal('percent_of_installment'), rate }),
  ]),
  appliesFromPeriod: z.number().int().positive().optional(),
  appliesToPeriod: z.number().int().positive().optional(),
});

const rounding = z.object({ mode: z.enum(['round', 'floor', 'ceil']), unit: z.number().int().positive(), remainderTo: z.enum(['last', 'first']) });

const obligationBase = {
  id,
  profileId: z.string(),
  institutionId: id,
  name: z.string().min(1, 'Cần tên khoản'),
  status: z.enum(['active', 'closed', 'paused']),
  tags: z.array(z.string()).optional(),
  note: z.string().optional(),
  createdAt: isoDate,
  dueDateEstimated: z.boolean().optional(),
};

export const obligationSchema = z.discriminatedUnion('kind', [
  z.object({
    ...obligationBase,
    kind: z.literal('credit_card'),
    creditLineId: id,
    last4: z.string().regex(/^\d{4}$/, 'last4 phải đúng 4 chữ số').optional(),
    statementDay: day,
    dueRule: dueDateRuleSchema,
    annualRate: rate.optional(),
    minimumPayment: z.object({ percentOfStatement: rate, floor: money.optional(), includeInstallmentsInFull: z.boolean() }).optional(),
    paymentPolicy: policy.optional(),
  }),
  z
    .object({
      ...obligationBase,
      kind: z.literal('installment_loan'),
      principal: money.positive('Số tiền vay phải > 0'),
      netDisbursed: money.optional(),
      startDate: isoDate,
      periods: z.number().int().min(1, 'Số kỳ phải ≥ 1'),
      interestModel: interestModelSchema,
      dueRule: dueDateRuleSchema,
      perPeriodFees: z.array(feeRuleSchema).optional(),
      upfrontFees: z.array(feeRuleSchema).optional(),
      link: z
        .object({ parentObligationId: z.string().optional(), creditLineId: z.string().optional(), sharesCreditLimit: z.boolean(), billedIntoStatement: z.boolean() })
        .optional(),
      opening: z.object({ asOf: isoDate, periodsPaid: z.number().int().nonnegative(), principalRemaining: money.optional() }).optional(),
      rounding: rounding.optional(),
    })
    .refine((o) => o.netDisbursed === undefined || o.netDisbursed <= o.principal, {
      message: 'Tiền thực nhận không được lớn hơn số tiền vay',
      path: ['netDisbursed'],
    }),
  z.object({ ...obligationBase, kind: z.literal('revolving'), creditLineId: id, dueRule: dueDateRuleSchema, annualRate: rate }),
  z.object({
    ...obligationBase,
    kind: z.literal('custom'),
    schedule: z.array(z.object({ dueDate: isoDate, amount: money, note: z.string().optional() })),
  }),
]);

export const profileStateSchema = z.object({
  schemaVersion: z.number().int(),
  profile: z.object({
    id,
    name: z.string(),
    currency: z.string().length(3),
    locale: z.string(),
    schemaVersion: z.number().int(),
    settings: z.object({
      defaultCardPaymentPolicy: policy,
      dueSoonThresholdDays: z.number().int().nonnegative(),
      utilizationWarning: rate,
      weekendShift,
      holidays: z.array(isoDate),
      reminderDaysBefore: z.array(z.number().int().nonnegative()),
      highAprThreshold: rate,
      loanDebtMeasure: z.enum(['auto', 'principal', 'remaining_payments']),
      groupByDate: z.boolean(),
    }),
  }),
  institutions: z.array(
    z.object({
      id,
      name: z.string(),
      type: z.enum(['bank', 'finance_company', 'bnpl', 'individual', 'other']),
      defaults: z
        .object({
          perPeriodFee: z.array(feeRuleSchema).optional(),
          upfrontFees: z.array(feeRuleSchema).optional(),
          dueDateRule: dueDateRuleSchema.optional(),
          interestModel: interestModelSchema.optional(),
          rounding: rounding.optional(),
          weekendShift: weekendShift.optional(),
        })
        .optional(),
      presetKey: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  creditLines: z.array(z.object({ id, institutionId: id, name: z.string(), limit: money })),
  obligations: z.array(obligationSchema),
  statements: z.array(
    z.object({
      id,
      obligationId: id,
      statementDate: isoDate,
      dueDate: isoDate,
      statementBalance: money,
      currentBalance: money,
      minimumDue: money.optional(),
      capturedAt: isoDate,
    }),
  ),
  payments: z.array(
    z.object({
      id,
      obligationId: id,
      dueItemKey: z.string().optional(),
      date: isoDate,
      amount: money,
      method: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  plannedAmounts: z.record(z.string(), money),
  cashAccounts: z.array(z.object({ id, name: z.string(), balance: z.number().int(), updatedAt: isoDate })),
  incomes: z.array(
    z.object({
      id,
      name: z.string(),
      amount: money,
      recurrence: z.discriminatedUnion('type', [
        z.object({ type: z.literal('once'), date: isoDate }),
        z.object({ type: z.literal('monthly'), day, from: yearMonth.optional(), to: yearMonth.optional() }),
      ]),
    }),
  ),
  scenarios: z.array(
    z.object({
      id,
      name: z.string(),
      horizonMonths: z.number().int().min(1).max(120),
      assumeAllPaidOnTime: z.boolean(),
      cardMonthlySpending: z.record(z.string(), money),
      extraPayments: z.array(z.object({ obligationId: id, month: yearMonth, amount: money })).optional(),
      incomeOverrides: z.record(z.string(), money).optional(),
      carryLeftover: z.boolean().optional(),
    }),
  ),
  viewMonth: yearMonth,
});

export const formatZodError = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`).join('\n');

/** Kiểm tra khi nhập liệu (mục 14) — trả về danh sách lỗi dễ đọc. */
export function validateObligation(ob: Obligation, today: ISODate): string[] {
  const r = obligationSchema.safeParse(ob);
  const errors = r.success ? [] : r.error.issues.map((i) => i.message);
  if (ob.kind === 'installment_loan') {
    if (ob.startDate > addMonths(today, 12)) errors.push('Ngày giải ngân không được quá 1 năm sau hôm nay');
    const m = ob.interestModel;
    if (m.type === 'fixed_installment' && m.installment * ob.periods < ob.principal) {
      errors.push('Số tiền mỗi kỳ × số kỳ nhỏ hơn số tiền vay — kiểm tra lại số tiền mỗi kỳ hoặc số kỳ');
    }
    if (ob.link?.billedIntoStatement && !ob.link.parentObligationId) {
      errors.push('Khoản nằm trong sao kê thẻ: hãy chọn thẻ ở "Gắn vào thẻ"');
    } else if (ob.link?.sharesCreditLimit && !ob.link.parentObligationId && !ob.link.creditLineId) {
      errors.push('Khoản dùng chung hạn mức: hãy chọn thẻ ở "Gắn vào thẻ"');
    }
    if (m.type === 'custom_schedule' && m.rows.reduce((s, r) => s + r.principal, 0) !== ob.principal) {
      errors.push('Tổng gốc trong bảng nhập tay phải bằng số tiền vay');
    }
  }
  return errors;
}
