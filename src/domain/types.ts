// ---------- primitives ----------
export type ID = string;
export type ISODate = string; // 'YYYY-MM-DD'
export type YearMonth = string; // 'YYYY-MM'
export type Money = number; // số nguyên, đơn vị nhỏ nhất của tiền tệ profile
export type Rate = number; // phân số, 0.012 = 1,2%

// ---------- profile ----------
export type CardPaymentPolicy =
  | 'current_balance'
  | 'statement_balance'
  | 'minimum'
  | { type: 'fixed'; amount: Money };

export type WeekendShift = 'none' | 'next_business_day' | 'previous_business_day';

/**
 * Cách tính "dư nợ" của khoản vay trả góp trong tổng hợp:
 * - auto: khoản dùng chung hạn mức thẻ → gốc còn lại (đúng phần ngân hàng chiếm hạn mức);
 *         khoản độc lập → tổng số tiền còn phải trả (gốc + lãi + phí).
 * - principal: luôn là gốc còn lại.
 * - remaining_payments: luôn là tổng còn phải trả.
 */
export type LoanDebtMeasure = 'auto' | 'principal' | 'remaining_payments';

export interface ProfileSettings {
  defaultCardPaymentPolicy: CardPaymentPolicy;
  dueSoonThresholdDays: number;
  utilizationWarning: Rate;
  weekendShift: WeekendShift;
  holidays: ISODate[];
  reminderDaysBefore: number[];
  highAprThreshold: Rate;
  loanDebtMeasure: LoanDebtMeasure;
  groupByDate: boolean;
}

export interface Profile {
  id: ID;
  name: string;
  currency: string;
  locale: string;
  settings: ProfileSettings;
  schemaVersion: number;
}

export interface RoundingPolicy {
  mode: 'round' | 'floor' | 'ceil';
  unit: Money;
  remainderTo: 'last' | 'first';
}

// ---------- rules ----------
export type DueDateRule =
  | { type: 'fixed_day'; day: number; cutoffDay: number; offsetIfOnOrBeforeCutoff: number; offsetIfAfterCutoff: number }
  | { type: 'same_day_as_start'; offsetMonths?: number }
  | { type: 'statement_offset'; statementDay: number; daysAfterStatement: number }
  | { type: 'statement_fixed_due'; statementDay: number; dueDay: number }
  | { type: 'explicit'; dates: ISODate[] }
  | { type: 'every_n_days'; n: number; anchor: ISODate };

export type InterestModel =
  | { type: 'flat_monthly'; monthlyRate: Rate }
  | { type: 'reducing_balance'; annualRate: Rate }
  | { type: 'reducing_equal_principal'; annualRate: Rate }
  | { type: 'fixed_installment'; installment: Money }
  | { type: 'zero_interest' }
  | { type: 'custom_schedule'; rows: { principal: Money; interest: Money }[] };

export interface FeeRule {
  id: ID;
  name: string;
  timing: 'per_period' | 'upfront_deducted' | 'upfront_paid' | 'one_time';
  amount:
    | { type: 'fixed'; value: Money }
    | { type: 'percent_of_principal'; rate: Rate }
    | { type: 'percent_of_installment'; rate: Rate };
  appliesFromPeriod?: number;
  appliesToPeriod?: number;
}

// ---------- institutions ----------
export type InstitutionType = 'bank' | 'finance_company' | 'bnpl' | 'individual' | 'other';

export interface Institution {
  id: ID;
  name: string;
  type: InstitutionType;
  defaults?: {
    perPeriodFee?: FeeRule[];
    upfrontFees?: FeeRule[];
    dueDateRule?: DueDateRule;
    interestModel?: InterestModel;
    rounding?: RoundingPolicy;
    weekendShift?: WeekendShift;
  };
  presetKey?: string;
  note?: string;
}

// ---------- credit lines & obligations ----------
export interface CreditLine {
  id: ID;
  institutionId: ID;
  name: string;
  limit: Money;
}

export type ObligationKind = 'credit_card' | 'installment_loan' | 'revolving' | 'custom';

export interface ObligationBase {
  id: ID;
  profileId: ID;
  institutionId: ID;
  kind: ObligationKind;
  name: string;
  status: 'active' | 'closed' | 'paused';
  tags?: string[];
  note?: string;
  createdAt: ISODate;
  /** Ngày đến hạn là tạm tính (cảnh báo ESTIMATED_DATE) */
  dueDateEstimated?: boolean;
}

export interface MinimumPaymentRule {
  percentOfStatement: Rate;
  floor?: Money;
  includeInstallmentsInFull: boolean;
}

/** Phí chậm thanh toán: % số tiền tối thiểu chưa trả khi quá hạn, không thấp hơn floor. */
export interface LateFeeRule {
  percent: Rate;
  floor?: Money;
}

export interface CreditCardObligation extends ObligationBase {
  kind: 'credit_card';
  creditLineId: ID;
  last4?: string;
  statementDay: number;
  dueRule: DueDateRule;
  annualRate?: Rate;
  /** Lãi suất cao nhất khi ngân hàng công bố một khoảng (vd. 2–3,19%/tháng); annualRate là mức thấp */
  annualRateMax?: Rate;
  lateFee?: LateFeeRule;
  minimumPayment?: MinimumPaymentRule;
  paymentPolicy?: CardPaymentPolicy;
}

export interface ObligationLink {
  parentObligationId?: ID;
  creditLineId?: ID;
  sharesCreditLimit: boolean;
  billedIntoStatement: boolean;
}

export interface OpeningState {
  asOf: ISODate;
  periodsPaid: number;
  principalRemaining?: Money;
}

export interface InstallmentLoanObligation extends ObligationBase {
  kind: 'installment_loan';
  principal: Money;
  netDisbursed?: Money;
  startDate: ISODate;
  periods: number;
  interestModel: InterestModel;
  dueRule: DueDateRule;
  perPeriodFees?: FeeRule[];
  upfrontFees?: FeeRule[];
  link?: ObligationLink;
  opening?: OpeningState;
  rounding?: RoundingPolicy;
}

export interface RevolvingObligation extends ObligationBase {
  kind: 'revolving';
  creditLineId: ID;
  dueRule: DueDateRule;
  annualRate: Rate;
}

export interface CustomObligation extends ObligationBase {
  kind: 'custom';
  schedule: { dueDate: ISODate; amount: Money; note?: string }[];
}

export type Obligation = CreditCardObligation | InstallmentLoanObligation | RevolvingObligation | CustomObligation;
export type StatementBased = CreditCardObligation | RevolvingObligation;

// ---------- statements & payments ----------
export interface Statement {
  id: ID;
  obligationId: ID;
  statementDate: ISODate;
  dueDate: ISODate;
  statementBalance: Money;
  currentBalance: Money;
  minimumDue?: Money;
  capturedAt: ISODate;
}

export interface Payment {
  id: ID;
  obligationId: ID;
  dueItemKey?: string;
  date: ISODate;
  amount: Money;
  method?: string;
  note?: string;
}

// ---------- cash & scenarios ----------
export interface CashAccount {
  id: ID;
  name: string;
  balance: Money;
  updatedAt: ISODate;
}

export type IncomeRecurrence =
  | { type: 'once'; date: ISODate }
  | { type: 'monthly'; day: number; from?: YearMonth; to?: YearMonth };

export interface IncomeEntry {
  id: ID;
  name: string;
  amount: Money;
  recurrence: IncomeRecurrence;
}

export type ExpenseCategory =
  | 'housing'
  | 'food'
  | 'transport'
  | 'utilities'
  | 'family'
  | 'health'
  | 'education'
  | 'entertainment'
  | 'other';

/** Chi tiêu sinh hoạt trả bằng tiền mặt/tài khoản (chi tiêu bằng thẻ tính ở dư nợ thẻ). */
export interface ExpenseEntry {
  id: ID;
  name: string;
  category: ExpenseCategory;
  amount: Money;
  recurrence: IncomeRecurrence;
}

export interface Scenario {
  id: ID;
  name: string;
  horizonMonths: number;
  assumeAllPaidOnTime: boolean;
  cardMonthlySpending: Record<ID, Money>;
  extraPayments?: { obligationId: ID; month: YearMonth; amount: Money }[];
  incomeOverrides?: Record<YearMonth, Money>;
  /** Cộng dồn tiền còn lại sang tháng sau */
  carryLeftover?: boolean;
}

// ---------- profile state (đơn vị lưu trữ) ----------
export interface ProfileState {
  schemaVersion: number;
  profile: Profile;
  institutions: Institution[];
  creditLines: CreditLine[];
  obligations: Obligation[];
  statements: Statement[];
  payments: Payment[];
  /** Số tiền dự định trả theo dueItemKey */
  plannedAmounts: Record<string, Money>;
  cashAccounts: CashAccount[];
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
  scenarios: Scenario[];
  viewMonth: YearMonth;
}

// ---------- engine outputs ----------
export interface ScheduleRow {
  n: number;
  dueDate: ISODate;
  principal: Money;
  interest: Money;
  fees: Money;
  total: Money;
  principalRemainingAfter: Money;
}

export type DueState = 'upcoming' | 'due_soon' | 'overdue' | 'partial' | 'paid' | 'not_yet';

export interface DueItem {
  key: string;
  obligationId: ID;
  institutionId: ID;
  kind: 'card_statement' | 'installment' | 'fee' | 'custom';
  periodIndex?: number;
  periodsTotal?: number;
  dueDate: ISODate;
  breakdown: { principal: Money; interest: Money; fees: Money };
  amount: Money;
  plannedAmount?: Money;
  includedIn?: ID;
  state: DueState;
  paidAmount: Money;
  label: string;
}
