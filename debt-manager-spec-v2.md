# Debt Manager v2 — Đặc tả tổng quát (đa người dùng, cấu hình linh hoạt)

> Phiên bản tổng quát của `debt-manager-spec.md`. App **không gắn cứng** với bất kỳ ngân hàng, thẻ hay khoản vay cụ thể nào. Mọi quy tắc của từng tổ chức (ngày trả cố định, phí thu hộ, dùng chung hạn mức, gộp vào sao kê, cách tính lãi…) đều là **cấu hình dữ liệu**, nên người dùng khác có thể dùng app cho tình huống của họ.

---

## Mục lục

1. Mục tiêu & phạm vi
2. Nguyên tắc thiết kế
3. Khái niệm cốt lõi
4. Mô hình dữ liệu
5. Quy tắc lịch đến hạn (Due Date Rules)
6. Mô hình lãi & phí
7. Liên kết giữa các khoản (dùng chung hạn mức, gộp sao kê)
8. Chính sách thanh toán thẻ
9. Sổ thanh toán (Payment Ledger) & tiến độ kỳ
10. Engine tính toán
11. Tổng hợp tháng
12. Dự phóng nhiều tháng (Projection)
13. Dòng tiền & ngân sách
14. Cảnh báo & kiểm tra dữ liệu
15. Mẫu tổ chức (Institution Presets)
16. Lưu trữ, đồng bộ, đa người dùng
17. Bản địa hoá & tiền tệ
18. Bảo mật & quyền riêng tư
19. Giao diện
20. Kiến trúc mã nguồn
21. Kiểm thử
22. Lộ trình phát triển
23. Phụ lục A: ví dụ cấu hình thật (tham khảo, không hard-code)
24. Phụ lục B: công thức toán học

---

## 1. Mục tiêu & phạm vi

**App trả lời được các câu hỏi:**

- Tháng này tôi phải trả **bao nhiêu**, cho **khoản nào**, **trước ngày nào**?
- Khoản nào **sắp đến hạn / quá hạn**?
- **Tổng dư nợ** của tôi là bao nhiêu, đang ở tổ chức nào?
- Tiền tôi đang có có **đủ** trả không, thiếu bao nhiêu?
- Nếu tôi trả đúng hạn, **N tháng tới** tôi phải trả bao nhiêu mỗi tháng? Khi nào tôi **hết nợ**?
- Khoản vay này có **lãi suất thực tế** là bao nhiêu (sau khi tính phí và bảo hiểm bị trừ)?
- Thẻ còn **hạn mức khả dụng** bao nhiêu (sau khi trừ các khoản vay dùng chung hạn mức)?

**Trong phạm vi:** thẻ tín dụng, trả góp qua thẻ, vay tiêu dùng (ngân hàng hoặc công ty tài chính), vay trả góp mua hàng (BNPL), vay cá nhân và các khoản nợ tự định nghĩa.

**Ngoài phạm vi ở bản đầu:** kết nối API ngân hàng, đọc sao kê tự động, thanh toán hộ.

---

## 2. Nguyên tắc thiết kế

| # | Nguyên tắc |
|---|---|
| P1 | **Không hard-code tổ chức.** Quy tắc riêng của từng tổ chức được mô tả bằng `Institution` và `Rule`. Có thể có preset, nhưng người dùng sửa được. |
| P2 | **Hàm thuần, xác định.** Mọi phép tính là hàm thuần, nhận `today` làm tham số. Cùng input luôn ra cùng output, nên test được. |
| P3 | **Tiền là số nguyên ở đơn vị nhỏ nhất** (VND = đồng, USD = cent). Chỉ làm tròn theo `RoundingPolicy` ở các điểm đã định nghĩa. |
| P4 | **Ngày là ngày thuần** (`YYYY-MM-DD`), không có giờ hay múi giờ. |
| P5 | **Ghi nhận sự thật, suy ra trạng thái.** Lưu khoản thanh toán thực tế (ledger). "Số kỳ đã trả" và "đã trả chưa" được suy ra, không gõ tay (trừ số dư đầu kỳ khi bắt đầu theo dõi). |
| P6 | **Không đếm trùng.** Khoản trả góp đã nằm trong sao kê thẻ thì không cộng thêm lần nữa vào tổng phải trả. |
| P7 | **Schema có phiên bản.** Mỗi lần đổi cấu trúc dữ liệu có migration, để dữ liệu người dùng cũ không vỡ. |
| P8 | **Mở rộng bằng plugin.** Thêm kiểu lãi, quy tắc ngày hay loại khoản mới bằng cách đăng ký strategy mới, không phải sửa engine. |

---

## 3. Khái niệm cốt lõi

| Khái niệm | Ý nghĩa |
|---|---|
| **Profile** | Một người dùng hoặc một bộ dữ liệu độc lập (ví dụ "Của tôi", "Của vợ/chồng"). |
| **Institution** | Tổ chức cho vay (ngân hàng, công ty tài chính, ví trả sau, cá nhân). Chứa mặc định như phí, quy tắc ngày, làm tròn. |
| **Obligation** (khoản nợ) | Thực thể nợ trung tâm. Có `kind`: `credit_card`, `installment_loan`, `revolving`, `custom`. |
| **CreditLine** | Hạn mức tín dụng. Một thẻ có một CreditLine, và các khoản vay khác có thể **dùng chung** hạn mức đó. |
| **Statement** | Snapshot sao kê của thẻ theo kỳ: ngày sao kê, ngày đến hạn, dư nợ sao kê, dư nợ hiện tại. |
| **DueItem** | Một khoản phải trả cụ thể trong một kỳ, do engine sinh ra: ngày đến hạn, số tiền, tách gốc/lãi/phí. |
| **Payment** | Một lần thanh toán thực tế, gắn với obligation và có thể gắn với DueItem. |
| **CashAccount / IncomeEntry** | Tiền hiện có và thu nhập dự kiến, để kiểm tra đủ/thiếu. |
| **Scenario** | Bộ giả định cho dự phóng: chi tiêu thẻ mỗi tháng, thu nhập, trả trước hạn… |

---

## 4. Mô hình dữ liệu

```ts
// ---------- primitives ----------
type ID = string;                 // uuid
type ISODate = string;            // 'YYYY-MM-DD'
type YearMonth = string;          // 'YYYY-MM'
type Money = number;              // integer, minor units of profile currency
type Rate = number;               // decimal fraction, 0.012 = 1.2%

interface Profile {
  id: ID;
  name: string;
  currency: string;               // ISO 4217, ví dụ 'VND'
  locale: string;                 // 'vi-VN' | 'en-US' ...
  settings: ProfileSettings;
  schemaVersion: number;
}

interface ProfileSettings {
  defaultCardPaymentPolicy: CardPaymentPolicy;   // mục 8
  dueSoonThresholdDays: number;                  // mặc định 5
  utilizationWarning: Rate;                      // mặc định 0.30
  weekendShift: 'none' | 'next_business_day' | 'previous_business_day';
  holidays: ISODate[];                           // ngày nghỉ lễ để dời ngày đến hạn (tuỳ chọn)
  reminderDaysBefore: number[];                  // ví dụ [5, 1]
}

// ---------- institutions ----------
interface Institution {
  id: ID;
  name: string;                   // 'Ngân hàng A', 'Công ty tài chính B'
  type: 'bank' | 'finance_company' | 'bnpl' | 'individual' | 'other';
  defaults?: {
    perPeriodFee?: FeeRule[];             // ví dụ phí thu hộ mỗi kỳ
    upfrontFees?: FeeRule[];              // ví dụ bảo hiểm trừ khi giải ngân
    dueDateRule?: DueDateRule;            // ví dụ ngày cố định 19, cutoff 19
    interestModel?: InterestModel;
    rounding?: RoundingPolicy;
  };
  presetKey?: string;             // nếu tạo từ preset (mục 15)
  note?: string;
}

// ---------- credit lines & obligations ----------
interface CreditLine {
  id: ID;
  institutionId: ID;
  name: string;                   // 'Hạn mức thẻ X'
  limit: Money;
}

type ObligationKind = 'credit_card' | 'installment_loan' | 'revolving' | 'custom';

interface ObligationBase {
  id: ID;
  profileId: ID;
  institutionId: ID;
  kind: ObligationKind;
  name: string;
  status: 'active' | 'closed' | 'paused';
  tags?: string[];
  note?: string;
  createdAt: ISODate;
}

interface CreditCardObligation extends ObligationBase {
  kind: 'credit_card';
  creditLineId: ID;
  last4?: string;                       // tuỳ chọn, KHÔNG lưu số thẻ đầy đủ
  statementDay: number;                 // ngày sao kê (1–31)
  dueRule: DueDateRule;                 // thường là 'statement_offset' hoặc 'fixed_day'
  annualRate?: Rate;                    // thông tin / ước tính lãi khi trả thiếu
  minimumPayment?: MinimumPaymentRule;  // chỉ dùng khi policy = 'minimum'
  paymentPolicy?: CardPaymentPolicy;    // ghi đè cài đặt profile
}

interface InstallmentLoanObligation extends ObligationBase {
  kind: 'installment_loan';
  principal: Money;                     // số tiền vay ghi trên hợp đồng
  netDisbursed?: Money;                 // tiền thực nhận (sau phí/bảo hiểm trừ trước)
  startDate: ISODate;                   // ngày giải ngân/mở khoản
  periods: number;
  interestModel: InterestModel;         // mục 6
  dueRule: DueDateRule;                 // mục 5
  perPeriodFees?: FeeRule[];            // ghi đè/cộng thêm mặc định của institution
  upfrontFees?: FeeRule[];
  link?: ObligationLink;                // mục 7: gắn vào thẻ/hạn mức
  opening?: OpeningState;               // khi bắt đầu theo dõi giữa chừng
  rounding?: RoundingPolicy;
}

interface RevolvingObligation extends ObligationBase {
  kind: 'revolving';                    // vay hạn mức, thấu chi
  creditLineId: ID;
  dueRule: DueDateRule;
  annualRate: Rate;
}

interface CustomObligation extends ObligationBase {
  kind: 'custom';                       // nợ cá nhân, lịch tự nhập
  schedule: { dueDate: ISODate; amount: Money; note?: string }[];
}

type Obligation =
  | CreditCardObligation
  | InstallmentLoanObligation
  | RevolvingObligation
  | CustomObligation;

interface OpeningState {
  asOf: ISODate;                        // ngày bắt đầu theo dõi trong app
  periodsPaid: number;                  // số kỳ đã trả trước ngày đó
  principalRemaining?: Money;           // nếu biết chính xác từ ngân hàng thì ưu tiên
}

// ---------- statements (thẻ) ----------
interface Statement {
  id: ID;
  obligationId: ID;                     // thẻ
  statementDate: ISODate;
  dueDate: ISODate;
  statementBalance: Money;              // dư nợ sao kê
  currentBalance: Money;                // dư nợ hiện tại tại thời điểm nhập
  minimumDue?: Money;                   // nếu ngân hàng có ghi
  capturedAt: ISODate;
}

// ---------- payments ----------
interface Payment {
  id: ID;
  obligationId: ID;
  dueItemKey?: string;                  // khoá ổn định của DueItem (mục 10.2)
  date: ISODate;
  amount: Money;
  method?: string;
  note?: string;
}

// ---------- cash & scenarios ----------
interface CashAccount { id: ID; name: string; balance: Money; updatedAt: ISODate; }

interface IncomeEntry {
  id: ID;
  name: string;
  amount: Money;
  recurrence: { type: 'once'; date: ISODate } | { type: 'monthly'; day: number; from?: YearMonth; to?: YearMonth };
}

interface Scenario {
  id: ID;
  name: string;                         // 'Cơ bản', 'Tiết kiệm', ...
  horizonMonths: number;                // số tháng dự phóng, ví dụ 12
  assumeAllPaidOnTime: boolean;
  cardMonthlySpending: Record<ID, Money>;  // obligationId -> chi tiêu mới mỗi tháng
  extraPayments?: { obligationId: ID; month: YearMonth; amount: Money }[];  // trả trước hạn
  incomeOverrides?: Record<YearMonth, Money>;
}
```

---

## 5. Quy tắc lịch đến hạn (Due Date Rules)

Mỗi rule là một **strategy** với hai hàm:

```ts
interface DueDateStrategy<R extends DueDateRule> {
  firstDueDate(rule: R, startDate: ISODate): ISODate;
  nthDueDate(rule: R, first: ISODate, n: number): ISODate;   // n bắt đầu từ 1
}
```

| `type` | Tham số | Ý nghĩa | Ví dụ |
|---|---|---|---|
| `fixed_day` | `day`, `cutoffDay`, `offsetIfOnOrBeforeCutoff`, `offsetIfAfterCutoff` | Ngày cố định hàng tháng. Mở trước/sau ngày cutoff thì kỳ đầu lệch số tháng khác nhau. | Ngày 19, cutoff 19, offset 1/2: mở 12/08 → 19/09; mở 20/05 → 19/07 |
| `same_day_as_start` | `offsetMonths` (mặc định 1) | Kỳ đầu cùng ngày với ngày giải ngân, sau N tháng. | Giải ngân 15/11 → 15/12 |
| `statement_offset` | `statementDay`, `daysAfterStatement` | Ngày đến hạn = ngày sao kê + N ngày. | Sao kê 10, +25 ngày |
| `statement_fixed_due` | `statementDay`, `dueDay` | Sao kê ngày X, đến hạn ngày Y của tháng sau. | Sao kê 25, đến hạn 10 |
| `explicit` | `dates[]` | Lịch nhập tay. | Nợ cá nhân |
| `every_n_days` | `n`, `anchor` | Chu kỳ theo số ngày. | Trả sau 30 ngày |

```ts
type DueDateRule =
  | { type: 'fixed_day'; day: number; cutoffDay: number; offsetIfOnOrBeforeCutoff: number; offsetIfAfterCutoff: number }
  | { type: 'same_day_as_start'; offsetMonths?: number }
  | { type: 'statement_offset'; statementDay: number; daysAfterStatement: number }
  | { type: 'statement_fixed_due'; statementDay: number; dueDay: number }
  | { type: 'explicit'; dates: ISODate[] }
  | { type: 'every_n_days'; n: number; anchor: ISODate };
```

**Quy tắc chung:**

- **Ngày không tồn tại trong tháng** (ví dụ 31/02): kẹp về ngày cuối tháng, giống EDATE.
- **Ngày đến hạn rơi vào cuối tuần/ngày lễ:** xử lý theo `settings.weekendShift`. Nếu institution có quy định khác thì dùng của institution.
- **`fixed_day`:**
  ```
  first = setDay(addMonths(startMonth, start.day <= cutoffDay ? offsetIfOnOrBeforeCutoff : offsetIfAfterCutoff), day)
  nth(n) = setDay(addMonths(month(first), n - 1), day)
  ```

---

## 6. Mô hình lãi & phí

### 6.1 InterestModel (strategy)

```ts
type InterestModel =
  | { type: 'flat_monthly'; monthlyRate: Rate }                 // lãi phẳng trên gốc ban đầu
  | { type: 'reducing_balance'; annualRate: Rate }              // dư nợ giảm dần, trả đều (annuity)
  | { type: 'reducing_equal_principal'; annualRate: Rate }      // gốc đều, lãi giảm dần
  | { type: 'fixed_installment'; installment: Money }           // biết số tiền mỗi kỳ, app tự suy lãi
  | { type: 'zero_interest' }                                   // trả góp 0%
  | { type: 'custom_schedule'; rows: { principal: Money; interest: Money }[] };
```

Mỗi model sinh ra **bảng kỳ hạn** (amortization schedule):

```ts
interface ScheduleRow {
  n: number;                // kỳ thứ n
  dueDate: ISODate;
  principal: Money;
  interest: Money;
  fees: Money;              // phí mỗi kỳ (mục 6.2)
  total: Money;             // principal + interest + fees
  principalRemainingAfter: Money;
}
```

| Model | Gốc kỳ n | Lãi kỳ n |
|---|---|---|
| `flat_monthly` | `P / N` | `P × r` |
| `reducing_balance` | `PMT − lãi` | `dư nợ đầu kỳ × r_tháng` |
| `reducing_equal_principal` | `P / N` | `dư nợ đầu kỳ × r_tháng` |
| `fixed_installment` | suy từ `r = RATE(N, pmt, P)` rồi tính như `reducing_balance` | |
| `zero_interest` | `P / N` | 0 |

**Phần lẻ do làm tròn** được dồn vào kỳ cuối, để tổng gốc đúng bằng `P` (cấu hình được trong `RoundingPolicy`).

### 6.2 FeeRule

```ts
interface FeeRule {
  id: ID;
  name: string;                         // 'Phí thu hộ', 'Bảo hiểm khoản vay'
  timing: 'per_period' | 'upfront_deducted' | 'upfront_paid' | 'one_time';
  amount:
    | { type: 'fixed'; value: Money }
    | { type: 'percent_of_principal'; rate: Rate }
    | { type: 'percent_of_installment'; rate: Rate };
  appliesFromPeriod?: number;
  appliesToPeriod?: number;
}
```

- `per_period`: cộng vào `fees` của mỗi kỳ (ví dụ phí thu hộ cố định mỗi kỳ).
- `upfront_deducted`: trừ khi giải ngân, nên `netDisbursed = principal − fee`. Ảnh hưởng **lãi suất thực tế**, không ảnh hưởng lịch trả.
- `upfront_paid` / `one_time`: một khoản phải trả riêng, sinh ra một DueItem.

### 6.3 Chỉ số lãi suất (hiển thị cho người dùng)

| Chỉ số | Công thức |
|---|---|
| Lãi danh nghĩa/năm | `RATE(N, installment_without_fees, principal) × 12` |
| **Lãi thực tế/năm (APR)** | `RATE(N, installment + per_period_fees, netDisbursed ?? principal) × 12` |
| Lãi hiệu dụng/năm (EAR) | `(1 + r_tháng_thực_tế)^12 − 1` |
| Tổng chi phí vay | `Σ total − (netDisbursed ?? principal)` |
| Quy đổi lãi phẳng ra lãi dư nợ giảm dần | `RATE(N, P/N + P×r_flat, P) × 12` |

Hàm `RATE` dùng Newton–Raphson, có fallback bisection khi không hội tụ (Phụ lục B).

---

## 7. Liên kết giữa các khoản

Một khoản vay có thể gắn vào một thẻ hoặc hạn mức:

```ts
interface ObligationLink {
  parentObligationId?: ID;        // thẻ chứa khoản này (nếu có)
  creditLineId?: ID;              // hạn mức bị chiếm dụng
  sharesCreditLimit: boolean;     // gốc còn lại có trừ vào hạn mức khả dụng không
  billedIntoStatement: boolean;   // kỳ trả có nằm trong sao kê thẻ không
}
```

| Tình huống | sharesCreditLimit | billedIntoStatement | Hệ quả |
|---|---|---|---|
| Trả góp chuyển đổi trên thẻ | ✔ | ✔ | Kỳ trả đã nằm trong sao kê, nên **không cộng riêng** vào tổng. Gốc chưa lên sao kê vẫn trừ hạn mức. |
| Vay tiêu dùng dùng chung hạn mức thẻ, trả riêng | ✔ | ✘ | Là một dòng phải trả **riêng** (ngày riêng). Gốc còn lại trừ hạn mức. |
| Vay độc lập | ✘ | ✘ | Không liên quan đến thẻ. |

**Công thức hạn mức:**

```
usedByCard        = currentBalance(card)
usedByLinked      = Σ linked where sharesCreditLimit:
                      billedIntoStatement ? principalRemaining − dueThisCycle : principalRemaining
availableLimit    = creditLine.limit − usedByCard − usedByLinked
utilization       = (limit − availableLimit) / limit
```

**Chống đếm trùng (P6):** khi tổng hợp, DueItem của khoản có `billedIntoStatement = true` được gắn cờ `includedIn: parentObligationId`. Nó chỉ hiển thị như chi tiết bên trong thẻ, không cộng vào tổng.

---

## 8. Chính sách thanh toán thẻ

```ts
type CardPaymentPolicy =
  | 'current_balance'      // trả hết dư nợ hiện tại (mặc định khuyến nghị: không lãi, gọn nhất)
  | 'statement_balance'    // trả đúng dư nợ sao kê: đủ để không bị lãi, giữ lại tiền chi tiêu sau ngày sao kê
  | 'minimum'              // trả tối thiểu (app cảnh báo lãi phát sinh)
  | { type: 'fixed'; amount: Money };

interface MinimumPaymentRule {
  percentOfStatement: Rate;            // ví dụ 0.05
  floor?: Money;                       // tối thiểu tuyệt đối
  includeInstallmentsInFull: boolean;  // kỳ trả góp tính đủ 100%
}
```

- Policy được đặt ở profile và có thể ghi đè theo từng thẻ.
- Khi policy là `minimum`, app hiện **ước tính lãi** = `(statementBalance − payment) × annualRate / 12` kèm cảnh báo.
- Người dùng có thể nhập **số tiền dự định trả** khác với policy cho một kỳ cụ thể.

---

## 9. Sổ thanh toán (Payment Ledger) & tiến độ kỳ

- Mỗi DueItem có **khoá ổn định**: `${obligationId}:${n}` cho khoản vay, `${obligationId}:${statementId}` cho thẻ.
- **Trạng thái DueItem:**
  ```
  paidAmount = Σ payments where dueItemKey == key
  state = paidAmount >= amount ? 'paid'
        : paidAmount > 0       ? 'partial'
        : dueDate < today      ? 'overdue'
        : daysUntil <= threshold ? 'due_soon'
        : dueDate > endOfViewMonth ? 'not_yet'
        : 'upcoming'
  ```
- **Số kỳ đã trả** = `opening.periodsPaid + count(DueItem paid với n > opening.periodsPaid)`.
- **Gốc còn lại** = `opening.principalRemaining` nếu người dùng nhập, nếu không thì lấy từ bảng kỳ hạn sau kỳ đã trả cuối cùng.
- **Trả trước hạn / tất toán:** Payment có `amount` lớn hơn DueItem, hoặc có loại `prepayment`. Engine tính lại bảng kỳ hạn theo cấu hình của institution: giảm số kỳ hoặc giảm tiền mỗi kỳ.
- **Kiểm tra lệch:** so `opening.periodsPaid` với số kỳ đáng ra đã trả theo lịch tại `opening.asOf`. Nếu lệch thì hiện cảnh báo, không tự sửa.

---

## 10. Engine tính toán

### 10.1 Pipeline

```
Profile data ──► normalize ──► buildSchedules ──► generateDueItems(month range)
                                                     │
               payments ──► applyLedger ─────────────┤
                                                     ▼
                                     DueItem[] (có trạng thái)
                                                     │
            ┌──────────────────┬─────────────────────┼──────────────────┐
            ▼                  ▼                     ▼                  ▼
      monthlySummary     creditLineUsage       projection(N)       alerts
```

### 10.2 DueItem

```ts
interface DueItem {
  key: string;                      // ổn định, dùng để gắn Payment
  obligationId: ID;
  institutionId: ID;
  kind: 'card_statement' | 'installment' | 'fee' | 'custom';
  periodIndex?: number;             // n
  periodsTotal?: number;
  dueDate: ISODate;                 // đã áp weekendShift
  breakdown: { principal: Money; interest: Money; fees: Money };
  amount: Money;                    // số phải trả theo policy
  plannedAmount?: Money;            // người dùng nhập
  includedIn?: ID;                  // nằm trong sao kê thẻ nào (không cộng riêng)
  state: 'upcoming' | 'due_soon' | 'overdue' | 'partial' | 'paid' | 'not_yet';
  paidAmount: Money;
}
```

### 10.3 API của engine (hàm thuần)

```ts
buildSchedule(ob: InstallmentLoanObligation, inst: Institution): ScheduleRow[]
dueItemsForMonth(state: ProfileState, month: YearMonth, today: ISODate): DueItem[]
creditLineUsage(state: ProfileState, lineId: ID, today: ISODate): { limit; used; available; utilization; breakdown }
monthlySummary(state: ProfileState, month: YearMonth, today: ISODate): MonthlySummary
project(state: ProfileState, scenario: Scenario, fromMonth: YearMonth, today: ISODate): ProjectionMonth[]
loanMetrics(ob: InstallmentLoanObligation, inst: Institution): { nominalAPR; effectiveAPR; EAR; totalCost }
alerts(state: ProfileState, today: ISODate): Alert[]
```

---

## 11. Tổng hợp tháng

```ts
interface MonthlySummary {
  month: YearMonth;
  rows: {
    obligationId: ID; label: string; institution: string;
    dueDate?: ISODate; amount: Money; planned: Money; state: DueItem['state'];
    debtRemaining: Money;
    children?: DueItem[];          // ví dụ các kỳ trả góp nằm trong sao kê thẻ
  }[];
  totals: {
    payable: Money;                // Σ amount (không gồm includedIn)
    planned: Money;
    unpaid: Money;                 // Σ planned của dòng chưa 'paid'
    debt: Money;                   // tổng dư nợ toàn bộ
    dueSoonOrOverdue: number;
  };
  cash: { available: Money; leftover: Money; verdict: 'enough' | 'short' | 'unknown'; shortBy?: Money };
  byInstitution: Record<ID, { payable: Money; debt: Money }>;
}
```

**Quy tắc tổng hợp:**

- Mỗi obligation thường là một dòng. Các khoản trả riêng có ngày khác nhau thì được nhóm theo `(institution, dueDate)` nếu người dùng bật "gộp theo ngày".
- Khoản vay **chưa đến kỳ** trong tháng: `amount = 0`, `state = 'not_yet'`, nhưng vẫn tính vào `debtRemaining`.
- **Dư nợ của thẻ** = dư nợ hiện tại + gốc của các khoản `billedIntoStatement` chưa lên sao kê.

---

## 12. Dự phóng nhiều tháng (Projection)

Mô phỏng tháng `m1…mN` với giả định đã trả đúng hạn (`assumeAllPaidOnTime`):

```
for month in horizon:
  installments = Σ schedule rows có dueDate trong month (bỏ khoản includedIn, chúng đã nằm trong thẻ)
  cards        = Σ theo thẻ: chi tiêu tháng trước (scenario.cardMonthlySpending)
                 + kỳ trả góp billedIntoStatement của tháng này
  extra        = Σ scenario.extraPayments của month
  income       = incomeOverrides[month] ?? Σ IncomeEntry hiệu lực
  carry        = leftover tháng trước (tuỳ chọn cộng dồn)
  leftover     = income + carry − (installments + cards + extra)
  ghi nhận khoản nào kết thúc trong tháng ("hết nợ X")
```

**Kết quả:** bảng theo tháng, biểu đồ cột phải trả mỗi tháng, đường dư nợ còn lại, **ngày hết nợ** dự kiến, và tháng đầu tiên bị thiếu tiền.

**Chiến lược trả nợ (tuỳ chọn):** "Avalanche" ưu tiên trả trước khoản có APR thực tế cao nhất. "Snowball" ưu tiên khoản có dư nợ nhỏ nhất. Mỗi chiến lược có ước tính số lãi tiết kiệm được.

---

## 13. Dòng tiền & ngân sách

- **CashAccount**: số dư hiện có, người dùng cập nhật tay.
- **IncomeEntry**: lương hoặc thu nhập định kỳ, có ngày nhận trong tháng.
- **Kiểm tra theo thời điểm (timeline):** không chỉ so tổng tháng, mà mô phỏng theo ngày. Ví dụ lương về ngày 10 nhưng khoản đến hạn ngày 5, thì cảnh báo "thiếu tạm thời" dù tổng tháng vẫn đủ.
- **Kết luận:** `enough`, `short` (kèm số thiếu) hoặc `short_temporarily` (kèm ngày bị thiếu).

---

## 14. Cảnh báo & kiểm tra dữ liệu

| Mã | Điều kiện | Mức |
|---|---|---|
| `DUE_SOON` | DueItem còn ≤ `dueSoonThresholdDays` ngày | warning |
| `OVERDUE` | Quá hạn mà chưa trả đủ | error |
| `HIGH_UTILIZATION` | utilization > `utilizationWarning` | warning |
| `OVER_LIMIT` | availableLimit < 0 | error |
| `PERIOD_MISMATCH` | Số kỳ đã trả nhập tay lệch với lịch | warning |
| `CASH_SHORT` | Tiền không đủ trong tháng/ngày | error |
| `HIGH_APR` | APR thực tế > ngưỡng (ví dụ 40%) | info |
| `MINIMUM_POLICY_INTEREST` | Đang dùng policy `minimum` nên phát sinh lãi | warning |
| `MISSING_STATEMENT` | Thẻ chưa có sao kê cho kỳ hiện tại | info |
| `ESTIMATED_DATE` | Ngày đến hạn được đánh dấu "tạm tính" | info |

**Kiểm tra khi nhập liệu:** số tiền ≥ 0, `periods ≥ 1`, `day` trong khoảng 1–31, `startDate ≤ today + 1 năm`, `netDisbursed ≤ principal`, last4 đúng 4 chữ số.

---

## 15. Mẫu tổ chức (Institution Presets)

Preset là **file JSON có thể chia sẻ**, không phải code. Người dùng chọn preset khi thêm khoản, rồi được sửa mọi tham số.

```ts
interface InstitutionPreset {
  key: string;                    // 'example-bank-consumer-loan'
  displayName: string;
  country: string;                // 'VN'
  version: number;
  institution: Omit<Institution, 'id'>;
  obligationTemplates: {
    label: string;                // 'Vay tiêu dùng trên hạn mức thẻ'
    kind: ObligationKind;
    defaults: Partial<InstallmentLoanObligation | CreditCardObligation>;
  }[];
  source?: string;                // ghi nguồn hoặc "do người dùng đóng góp"
  verifiedAt?: ISODate;
}
```

- Preset được nạp từ thư mục `presets/` hoặc import từ file.
- Preset **không bao giờ** tự động thay đổi khoản đã tạo. Khi preset cập nhật, app chỉ gợi ý.
- Cho phép người dùng **xuất cấu hình institution của mình thành preset** để chia sẻ (không kèm số tiền hay dữ liệu cá nhân).

---

## 16. Lưu trữ, đồng bộ, đa người dùng

### 16.1 Storage adapter

```ts
interface StorageAdapter {
  load(profileId: ID): Promise<ProfileState | null>;
  save(state: ProfileState): Promise<void>;
  listProfiles(): Promise<Profile[]>;
  deleteProfile(id: ID): Promise<void>;
}
```

| Giai đoạn | Adapter |
|---|---|
| MVP | `IndexedDBAdapter` (dữ liệu lớn hơn localStorage, không chặn UI) |
| Chia sẻ thiết bị | Nhiều profile trên cùng máy, có thể đặt PIN cho từng profile |
| Đồng bộ | `RemoteAdapter` (Supabase / Firebase / API riêng) có đăng nhập. Dữ liệu theo `userId`, bật Row Level Security |

### 16.2 Phiên bản & migration

```ts
const migrations: Record<number, (old: any) => any> = {
  1: (s) => s,
  2: (s) => ({ ...s, /* thêm field mới với mặc định */ }),
};
```

Khi load, app chạy tuần tự các migration từ `schemaVersion` cũ đến bản mới nhất. **Luôn sao lưu bản cũ** trước khi migrate.

### 16.3 Xuất / nhập

- Xuất **JSON** (đầy đủ, có `schemaVersion`) và **CSV** (lịch trả, lịch sử thanh toán).
- Nhập JSON có kiểm tra schema (zod). Nếu trùng ID thì hỏi người dùng muốn ghi đè hay nhân bản.
- Tuỳ chọn **mã hoá file xuất** bằng mật khẩu (AES-GCM, khoá dẫn xuất qua PBKDF2).

### 16.4 Đồng bộ nhiều thiết bị (giai đoạn sau)

- Mỗi bản ghi có `updatedAt` và `deletedAt` (soft delete).
- Xung đột giải quyết theo "last-write-wins" từng bản ghi. Riêng Payment không bao giờ bị ghi đè, chỉ được thêm mới.

---

## 17. Bản địa hoá & tiền tệ

- i18n: dùng `i18next` hoặc tương đương, bắt đầu với `vi` và `en`.
- Tiền tệ theo profile, định dạng bằng `Intl.NumberFormat(locale, { style: 'currency', currency })`.
- `minorUnitDigits`: VND = 0, USD = 2. Engine luôn tính bằng số nguyên.
- `RoundingPolicy`: `{ mode: 'round' | 'floor' | 'ceil'; unit: Money /* làm tròn tới 1, 1000… */; remainderTo: 'last' | 'first' }`.
- Định dạng ngày theo locale, nhưng lưu trữ luôn ở dạng ISO.

---

## 18. Bảo mật & quyền riêng tư

- **Không lưu** số thẻ đầy đủ, CVV, mật khẩu hay OTP. Chỉ cho phép `last4`.
- Dữ liệu mặc định chỉ nằm trên thiết bị. Đồng bộ là tuỳ chọn và phải được người dùng bật rõ ràng.
- Có thể **khoá app** bằng PIN hoặc WebAuthn, và tự khoá sau X phút không dùng.
- **Chế độ riêng tư:** ẩn số tiền (hiện `•••`) khi chia sẻ màn hình.
- Không gửi telemetry có chứa số tiền hay tên tổ chức.
- Preset chia sẻ được làm sạch để không lộ dữ liệu cá nhân.

---

## 19. Giao diện

| Màn hình | Nội dung chính |
|---|---|
| **Onboarding** | Tạo profile, chọn tiền tệ, chọn policy trả thẻ, thêm tổ chức đầu tiên từ preset hoặc tạo mới. |
| **Dashboard (tháng)** | Bộ chọn tháng; thẻ KPI: phải trả, đã trả, còn lại, tổng dư nợ, đủ/thiếu; danh sách DueItem sắp xếp theo ngày, có badge trạng thái và nút "Ghi nhận thanh toán". |
| **Lịch** | Calendar view các ngày đến hạn, có màu theo trạng thái. |
| **Khoản nợ** | Danh sách obligations, lọc theo tổ chức/loại/trạng thái; trang chi tiết có bảng kỳ hạn, lịch sử thanh toán, chỉ số APR, nút tất toán. |
| **Thẻ & hạn mức** | Thanh hạn mức (dư nợ thẻ, khoản vay dùng chung, phần khả dụng), sao kê theo kỳ, form nhập sao kê mới. |
| **Dự phóng** | Chọn scenario và số tháng; biểu đồ phải trả mỗi tháng, đường dư nợ; mốc "hết nợ"; so sánh Avalanche/Snowball. |
| **Dòng tiền** | Tài khoản tiền, thu nhập định kỳ, timeline theo ngày trong tháng. |
| **Tổ chức & preset** | Quản lý institution, quy tắc mặc định, import/export preset. |
| **Cài đặt** | Ngôn ngữ, tiền tệ, ngưỡng cảnh báo, nhắc nhở, khoá app, xuất/nhập, profile. |

**Form thêm khoản vay** chỉ hỏi những gì người dùng thực sự biết: số tiền vay, tiền thực nhận, số kỳ, số tiền mỗi kỳ **hoặc** lãi suất, ngày giải ngân và quy tắc ngày trả (chọn từ preset). App tự suy ra phần còn lại và hiện **xem trước bảng kỳ hạn** trước khi lưu.

---

## 20. Kiến trúc mã nguồn

```
src/
  domain/                 # thuần TS, không phụ thuộc React
    types.ts
    money.ts              # cộng/trừ/làm tròn số nguyên, format
    dates.ts              # addMonths, endOfMonth, setDay, business-day shift
    rules/
      dueDate/            # fixedDay.ts, sameDayAsStart.ts, statementOffset.ts, ... + registry.ts
      interest/           # flatMonthly.ts, reducingBalance.ts, fixedInstallment.ts, ... + registry.ts
      fees.ts
    finance.ts            # rate(), pmt(), apr(), ear()
    schedule.ts           # buildSchedule
    ledger.ts             # applyPayments, periodsPaid
    creditLine.ts
    summary.ts
    projection.ts
    alerts.ts
    validation.ts         # zod schemas
    migrations.ts
  data/
    storage/              # indexedDb.ts, remote.ts, adapter.ts
    presets/              # *.json
  state/                  # Zustand/Redux store, selectors gọi domain
  features/               # dashboard/, obligations/, cards/, projection/, cashflow/, settings/
  components/             # UI dùng chung (MoneyInput, DateInput, StatusBadge, Chart…)
  i18n/
tests/
  domain/                 # unit test
  fixtures/               # bộ dữ liệu mẫu + kết quả mong đợi (golden files)
```

**Mở rộng bằng registry (P8):**

```ts
registerDueDateStrategy('fixed_day', fixedDayStrategy);
registerInterestModel('flat_monthly', flatMonthlyModel);
```

---

## 21. Kiểm thử

- **Unit test** cho từng strategy (rule ngày, mô hình lãi, phí), các hàm tài chính (`rate`, `pmt`) so với giá trị Excel, và các trường hợp biên của ngày (31/01 + 1 tháng, năm nhuận, cutoff đúng bằng ngày mở).
- **Golden tests:** fixture JSON đi kèm kết quả mong đợi của `monthlySummary` và `project`. Mỗi preset nên có ít nhất một fixture.
- **Property tests** (fast-check):
  - Σ gốc của bảng kỳ hạn luôn bằng `principal`.
  - Dư nợ không bao giờ âm.
  - Dự phóng với `assumeAllPaidOnTime` có dư nợ giảm dần, trừ phần chi tiêu thẻ mới.
- **Không đếm trùng:** khoản `billedIntoStatement` không được làm tổng thay đổi khi bật/tắt hiển thị chi tiết.
- **E2E** (Playwright): onboarding → thêm thẻ + vay → ghi nhận thanh toán → kiểm tra dashboard.

---

## 22. Lộ trình phát triển

| Giai đoạn | Nội dung |
|---|---|
| **MVP** | 1 profile, IndexedDB; thẻ + vay trả góp (`flat_monthly`, `fixed_installment`, `zero_interest`); rule `fixed_day`, `same_day_as_start`, `statement_fixed_due`; phí mỗi kỳ và phí trừ trước; liên kết hạn mức; tổng hợp tháng; dự phóng 1–12 tháng; xuất/nhập JSON; tiếng Việt. |
| **v1** | Payment ledger đầy đủ; nhiều profile + PIN; preset import/export; lịch; nhắc nhở (Notification API / PWA); tiếng Anh; CSV. |
| **v2** | Đồng bộ đám mây có đăng nhập; trả trước hạn/tất toán; Avalanche/Snowball; timeline dòng tiền theo ngày; chế độ riêng tư; PWA offline. |
| **v3** | Thư viện preset do cộng đồng đóng góp; đọc sao kê từ PDF/email (tuỳ chọn, chạy cục bộ); widget di động. |

---

## 23. Phụ lục A — Ví dụ cấu hình thật (tham khảo, KHÔNG hard-code)

Phụ lục này cho thấy tình huống ban đầu (file Excel) được **biểu diễn hoàn toàn bằng cấu hình**. Có thể dùng làm fixture test.

```jsonc
{
  "institutions": [
    { "id": "inst-sac", "name": "Sacombank", "type": "bank",
      "defaults": { "dueDateRule": { "type": "fixed_day", "day": 19, "cutoffDay": 19,
                                      "offsetIfOnOrBeforeCutoff": 1, "offsetIfAfterCutoff": 2 },
                    "interestModel": { "type": "flat_monthly", "monthlyRate": 0.012 } } },
    { "id": "inst-vib", "name": "VIB", "type": "bank" },
    { "id": "inst-shf", "name": "Shinhan Finance", "type": "finance_company",
      "defaults": { "perPeriodFee": [{ "id": "f1", "name": "Phí thu hộ", "timing": "per_period",
                                        "amount": { "type": "fixed", "value": 12000 } }] } },
    { "id": "inst-sf", "name": "SFinance", "type": "finance_company" }
  ],
  "creditLines": [
    { "id": "cl-sac", "institutionId": "inst-sac", "name": "Hạn mức Sacombank", "limit": 30000000 },
    { "id": "cl-vib", "institutionId": "inst-vib", "name": "Hạn mức VIB", "limit": 28800000 }
  ],
  "obligations": [
    { "id": "card-sac", "kind": "credit_card", "institutionId": "inst-sac", "creditLineId": "cl-sac",
      "name": "Thẻ Sacombank", "statementDay": 10,
      "dueRule": { "type": "statement_fixed_due", "statementDay": 10, "dueDay": 5 },
      "paymentPolicy": "current_balance" },
    { "id": "card-vib", "kind": "credit_card", "institutionId": "inst-vib", "creditLineId": "cl-vib",
      "name": "Thẻ VIB", "statementDay": 25,
      "dueRule": { "type": "statement_fixed_due", "statementDay": 25, "dueDay": 10 },
      "paymentPolicy": "current_balance" },

    { "id": "sac-1", "kind": "installment_loan", "institutionId": "inst-sac", "name": "Vay tiêu dùng 1",
      "principal": 8000000, "startDate": "2026-05-20", "periods": 5,
      "interestModel": { "type": "flat_monthly", "monthlyRate": 0.012 },
      "dueRule": { "type": "fixed_day", "day": 19, "cutoffDay": 19, "offsetIfOnOrBeforeCutoff": 1, "offsetIfAfterCutoff": 2 },
      "link": { "parentObligationId": "card-sac", "creditLineId": "cl-sac", "sharesCreditLimit": true, "billedIntoStatement": false },
      "opening": { "asOf": "2026-11-01", "periodsPaid": 4 } },
    // sac-2 (2026-08-12, 6tr, 3 kỳ, 1.2%), sac-3 (2026-09-28, 6tr, 2 kỳ, 1.2%), sac-4 (2026-10-26, 6tr, 3 kỳ, 1.27%) — tương tự

    { "id": "vib-1", "kind": "installment_loan", "institutionId": "inst-vib", "name": "Trả góp VIB",
      "principal": 17648053, "startDate": "2026-10-06", "periods": 9,
      "interestModel": { "type": "zero_interest" },
      "dueRule": { "type": "statement_fixed_due", "statementDay": 25, "dueDay": 10 },
      "link": { "parentObligationId": "card-vib", "creditLineId": "cl-vib", "sharesCreditLimit": true, "billedIntoStatement": true },
      "opening": { "asOf": "2026-11-01", "periodsPaid": 1 } },

    { "id": "shf-1", "kind": "installment_loan", "institutionId": "inst-shf", "name": "Shinhan khoản 1",
      "principal": 50000000, "startDate": "2026-06-15", "periods": 12,
      "interestModel": { "type": "fixed_installment", "installment": 5089434 },
      "dueRule": { "type": "same_day_as_start", "offsetMonths": 1 },
      "opening": { "asOf": "2026-11-01", "periodsPaid": 4 } },
    { "id": "shf-2", "kind": "installment_loan", "institutionId": "inst-shf", "name": "Shinhan khoản 2",
      "principal": 20000000, "netDisbursed": 18850000, "startDate": "2026-11-15", "periods": 12,
      "interestModel": { "type": "fixed_installment", "installment": 2059000 },
      "dueRule": { "type": "same_day_as_start", "offsetMonths": 1 } },
    { "id": "sf-1", "kind": "installment_loan", "institutionId": "inst-sf", "name": "SFinance",
      "principal": 20000000, "startDate": "2024-06-19", "periods": 36,
      "interestModel": { "type": "fixed_installment", "installment": 913000 },
      "dueRule": { "type": "same_day_as_start", "offsetMonths": 1 },
      "opening": { "asOf": "2026-11-01", "periodsPaid": 28 } }
  ],
  "settings": { "defaultCardPaymentPolicy": "current_balance", "dueSoonThresholdDays": 5 }
}
```

> Ghi chú: `startDate` của Shinhan khoản 1 và SFinance được **suy ngược** từ ngày đến hạn hiện tại và số kỳ đã trả, chỉ để minh hoạ. Ngày 15/12 của Shinhan khoản 2 là tạm tính.

**Kết quả mong đợi** (today = 2026-11-04, cùng số liệu với spec v1):

| Kiểm tra | Giá trị |
|---|---|
| Tổng phải trả tháng 11/2026 | **28.467.963 ₫** |
| Tổng dư nợ | **117.907.264 ₫** |
| Hạn mức khả dụng Sacombank / VIB | 6.033.254 ₫ / 7.826.954 ₫ |
| Shinhan khoản 2: APR danh nghĩa / thực tế | 40,9% / 54,4% |
| Dự phóng tháng 12/2026 (không chi tiêu thẻ mới) | **15.194.529 ₫** |

---

## 24. Phụ lục B — Công thức toán học

```ts
/** PMT: số tiền trả đều mỗi kỳ */
pmt(r, n, pv) = r === 0 ? pv / n : pv * r / (1 - (1 + r) ** -n)

/** RATE: lãi mỗi kỳ sao cho PV = PMT × (1 − (1+r)^−n) / r */
function rate(n: number, pmt: number, pv: number): number {
  const f  = (r: number) => (r === 0 ? pmt * n : pmt * (1 - (1 + r) ** -n) / r) - pv;
  const df = (r: number) => pmt * (n * (1 + r) ** (-n - 1) / r - (1 - (1 + r) ** -n) / (r * r));
  let r = 0.01;
  for (let i = 0; i < 100; i++) {           // Newton–Raphson
    const next = r - f(r) / df(r);
    if (!isFinite(next) || next <= -1) break;
    if (Math.abs(next - r) < 1e-12) return next;
    r = next;
  }
  let lo = 1e-9, hi = 1;                     // fallback: bisection
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    (f(mid) > 0 ? (lo = mid) : (hi = mid));
  }
  return (lo + hi) / 2;
}

/** Bảng kỳ hạn dư nợ giảm dần */
balance = P
for k in 1..N:
  interest  = round(balance * r)
  principal = k < N ? round(pmt - interest) : balance      // dồn phần lẻ vào kỳ cuối
  balance  -= principal

/** Lãi phẳng → lãi dư nợ giảm dần tương đương (năm) */
equivalentAPR = rate(N, P/N + P*r_flat, P) * 12

/** EAR */
EAR = (1 + r_month) ** 12 - 1
```
