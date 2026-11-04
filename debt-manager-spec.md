# Debt Manager — Đặc tả cho app React

Tài liệu này mô tả đầy đủ nghiệp vụ, công thức, dữ liệu mẫu và kết quả mong đợi để dựng một app React nhỏ quản lý nợ hàng tháng. Mọi quy tắc được chuyển từ file Excel `Quan_ly_no_hang_thang.xlsx` (đã kiểm chứng số liệu tháng 11 và 12/2026).

---

## 1. Mục tiêu

- Theo dõi **2 thẻ tín dụng** (Sacombank, VIB), **vay tiêu dùng Sacombank**, **khoản vay trên thẻ VIB**, và **vay công ty tài chính** (Shinhan Finance ×2, SFinance).
- Mỗi tháng cho biết: **phải trả bao nhiêu, khoản nào, ngày nào**, trạng thái (đã trả / sắp đến hạn / quá hạn), **tổng dư nợ**, và **tiền hiện có có đủ không**.
- **Giả định tháng sau**: nếu tháng này trả hết thì tháng sau phải đóng bao nhiêu.
- **Không bao giờ tính thanh toán tối thiểu** — thẻ tín dụng luôn trả hết dư nợ hiện tại để không bị lãi.

## 2. Công nghệ đề xuất

- React + Vite + TypeScript.
- Lưu dữ liệu bằng `localStorage` (một key JSON duy nhất), có nút Xuất/Nhập JSON để sao lưu.
- Không cần backend. Tất cả số liệu đều tính ở client bằng các hàm thuần (pure functions) trong `src/domain/`, để dễ viết test.
- Định dạng tiền: `new Intl.NumberFormat('vi-VN').format(n) + ' ₫'`. Ngày: `dd/mm/yyyy`.
- **Cẩn thận múi giờ**: lưu ngày dạng chuỗi `YYYY-MM-DD` và xử lý như ngày thuần (không giờ). Đừng dùng `new Date('2026-11-01')` rồi đọc `getDate()` theo giờ địa phương mà không kiểm soát — dễ lệch 1 ngày.

---

## 3. Mô hình dữ liệu (TypeScript)

```ts
type ISODate = string;        // 'YYYY-MM-DD'
type YearMonth = string;      // 'YYYY-MM'  (tháng đang xem)

interface CreditCard {
  id: 'sacombank' | 'vib' | string;
  name: string;               // 'Sacombank', 'VIB'
  creditLimit: number;        // Hạn mức
  currentDebt: number;        // Dư nợ hiện tại  -> số phải trả kỳ này
  statementDate: ISODate;     // Ngày sao kê
  dueDate: ISODate;           // Ngày đến hạn thanh toán
  statementBalance: number;   // Dư nợ sao kê kỳ này (thông tin)
  plannedPayment?: number;    // Số tiền dự định trả (trống => = currentDebt)
  paid: boolean;              // Đã trả kỳ này?
  annualInterestRate?: number;// Lãi suất thẻ, ví dụ 0.30 (thông tin)
  note?: string;
}

/** Vay tiêu dùng Sacombank – dùng chung hạn mức thẻ Sacombank, trả cố định ngày 19 */
interface SacombankLoan {
  id: string;
  name: string;
  startDate: ISODate;         // Ngày mở khoản vay
  principal: number;          // Số tiền gốc
  periods: number;            // Tổng số kỳ
  monthlyRate: number;        // Lãi/phí %/tháng, phẳng trên gốc ban đầu, ví dụ 0.012
  periodsPaid: number;        // Số kỳ đã trả TRƯỚC kỳ của tháng đang xem (người dùng nhập)
  note?: string;
}

/** Khoản vay/trả góp trên thẻ VIB – kỳ trả nằm trong dư nợ sao kê VIB */
interface VibLoan {
  id: string;
  name: string;
  startDate: ISODate;
  principal: number;
  periods: number;
  monthlyRate: number;        // có thể 0
  periodsPaid: number;        // số kỳ đã trả trước kỳ hiện tại
  note?: string;
}

/** Vay công ty tài chính (Shinhan Finance, SFinance, ...) */
interface FinanceLoan {
  id: string;
  lender: string;             // 'Shinhan Finance' | 'SFinance'
  label: string;              // 'Khoản vay 1', 'Vay 20tr / 12 tháng (khoản 2)'
  principal: number;          // Số tiền vay ban đầu
  annualRate?: number;        // Lãi suất danh nghĩa nhập tay (nếu không có thì tự tính, xem 5.6)
  netReceived?: number;       // Tiền thực nhận sau khi trừ bảo hiểm/phí
  periods: number;            // Tổng số kỳ
  periodsPaid: number;        // Số kỳ đã trả
  installment: number;        // Số tiền mỗi kỳ (chưa gồm phí thu hộ)
  collectionFee: number;      // Phí thu hộ mỗi kỳ (Shinhan = 12_000, SFinance = 0)
  dueDate?: ISODate;          // Ngày đến hạn của kỳ hiện tại / kỳ đầu
  paid: boolean;
  note?: string;
}

interface CashSource { id: string; label: string; amount: number; }

interface AppState {
  selectedMonth: YearMonth;           // ví dụ '2026-11'
  cards: CreditCard[];
  sacombankLoans: SacombankLoan[];
  sacombankLoansPaidThisMonth: boolean; // một cờ chung cho kỳ ngày 19
  vibLoans: VibLoan[];
  financeLoans: FinanceLoan[];
  cash: CashSource[];                 // tiền hiện có trong tháng đang xem
  nextMonth: {                        // dữ liệu cho màn "Giả định tháng sau"
    newSpendingSacombank: number;
    newSpendingVib: number;
    cashAvailable: number;
  };
}
```

---

## 4. Quy tắc nghiệp vụ

| # | Quy tắc |
|---|---|
| R1 | **Thẻ tín dụng trả hết dư nợ hiện tại.** Số phải trả = `currentDebt`. Không có khái niệm thanh toán tối thiểu. Nếu `plannedPayment` để trống thì dự định trả = `currentDebt`. |
| R2 | **Vay tiêu dùng Sacombank trả cố định ngày 19 hàng tháng.** Khoản mở **≤ ngày 19** → kỳ đầu là ngày 19 của **tháng sau**. Khoản mở **> ngày 19** → kỳ đầu là ngày 19 của **tháng sau nữa**. |
| R3 | **Vay Sacombank tính lãi/phí phẳng** trên gốc ban đầu: mỗi kỳ = `principal/periods + principal*monthlyRate`. |
| R4 | **Hạn mức Sacombank dùng chung với vay tiêu dùng**: hạn mức còn lại = hạn mức − dư nợ thẻ − tổng gốc vay Sacombank còn lại. Vay Sacombank **không** nằm trong sao kê thẻ — nó là một khoản phải trả riêng (ngày 19). |
| R5 | **VIB gộp khoản vay vào dư nợ hàng tháng**: kỳ vay VIB của tháng đã nằm trong `currentDebt` của thẻ VIB. Dư nợ VIB tổng = dư nợ thẻ + gốc vay VIB còn lại **chưa lên sao kê** (= gốc còn lại − kỳ này). Hạn mức còn lại VIB = hạn mức − dư nợ thẻ − (gốc vay còn lại − kỳ này). |
| R6 | **Shinhan Finance có phí thu hộ 12.000 ₫/kỳ**, cộng vào số phải đóng mỗi kỳ. SFinance phí = 0. |
| R7 | **Khoản vay công ty tài chính chưa đến hạn trong tháng đang xem thì không tính** vào số phải trả tháng đó (trạng thái "Chưa đến kỳ"), nhưng vẫn tính vào tổng dư nợ. |
| R8 | **Trạng thái** (dựa trên hôm nay): đã đánh dấu trả → "Đã trả"; ngày đến hạn < hôm nay → "Quá hạn"; còn ≤ 5 ngày → "Sắp đến hạn"; còn lại → "Còn hạn". |
| R9 | **Lãi suất tự tính** cho khoản vay có số tiền mỗi kỳ cố định: lãi danh nghĩa = `RATE(periods, installment, principal) × 12`; lãi thực tế = `RATE(periods, installment + fee, netReceived) × 12`. |
| R10 | **Giả định tháng sau**: tháng đang xem đã trả hết mọi khoản. Thẻ chỉ còn chi tiêu mới (người dùng nhập). Mọi khoản vay tiến thêm 1 kỳ. Không ghi đè dữ liệu gốc — chỉ tính thử. |

---

## 5. Công thức chi tiết

### 5.1 Tiện ích ngày

```ts
const day19 = (ym: YearMonth) => `${ym}-19`;
const endOfMonth = (ym: YearMonth): ISODate => { /* ngày cuối tháng */ };
const addMonths = (d: ISODate, n: number): ISODate => { /* như EDATE của Excel: giữ ngày, kẹp về cuối tháng nếu tràn */ };
const monthsBetween = (fromYM: YearMonth, toYM: YearMonth) =>
  (toY - fromY) * 12 + (toM - fromM);           // số tháng chênh lệch
const daysUntil = (d: ISODate, today: ISODate) => /* số ngày, có thể âm */;
```

### 5.2 Thẻ tín dụng

```ts
payable(card)       = card.currentDebt                         // R1
planned(card)       = card.plannedPayment ?? card.currentDebt
utilization         = (limit - availableLimit) / limit

// Sacombank (R4)
sacAvailable = sac.creditLimit - sac.currentDebt - sum(sacombankLoans.principalRemaining)

// VIB (R5)
vibUnbilled  = sum(vibLoans.principalRemaining) - sum(vibLoans.dueThisPeriod)
vibAvailable = vib.creditLimit - vib.currentDebt - vibUnbilled
vibTotalDebt = vib.currentDebt + vibUnbilled
```

### 5.3 Vay tiêu dùng Sacombank (R2, R3)

```ts
firstDueDate(loan) = day 19 of (month(startDate) + (day(startDate) > 19 ? 2 : 1))
principalPerPeriod = principal / periods
interestPerPeriod  = principal * monthlyRate
totalPerPeriod     = principalPerPeriod + interestPerPeriod
remainingPeriods   = max(0, periods - periodsPaid)
principalRemaining = principalPerPeriod * remainingPeriods

// Kỳ thứ n theo lịch của tháng ym (n bắt đầu từ 1)
n(loan, ym) = monthsBetween(month(firstDueDate), ym) + 1
dueIn(loan, ym) = (1 <= n && n <= periods) ? totalPerPeriod : 0
label(loan, ym) = n < 1 ? 'Chưa đến kỳ' : n > periods ? 'Hoàn tất' : `${n}/${periods}`
lastDueDate = addMonths(firstDueDate, periods - 1)

// Kiểm tra dữ liệu người dùng nhập
expectedPaid = max(0, min(periods, n - 1))
check = periodsPaid === expectedPaid ? 'OK' : `Lệch: theo lịch đã trả ${expectedPaid} kỳ`

sacombankLoansDueThisMonth = sum(dueIn(loan, selectedMonth))
dueDate = day19(selectedMonth)
status  = total === 0 ? 'Không có kỳ' : sacombankLoansPaidThisMonth ? 'Đã trả' : R8(dueDate)
```

### 5.4 Vay trên thẻ VIB

```ts
totalPerPeriod     = principal/periods + principal*monthlyRate
remainingPeriods   = max(0, periods - periodsPaid)     // tính cả kỳ tháng này
principalRemaining = principal/periods * remainingPeriods
dueThisPeriod      = remainingPeriods > 0 ? totalPerPeriod : 0
label              = `${periodsPaid + 1}/${periods}` hoặc 'Hoàn tất'
```

### 5.5 Vay công ty tài chính (R6, R7)

```ts
remainingPeriods = max(0, periods - periodsPaid)
totalThisPeriod  = installment + collectionFee
remainingTotal   = totalThisPeriod * remainingPeriods      // ước tính, giả định các kỳ bằng nhau

// Trong tháng đang xem:
countsThisMonth  = !dueDate || dueDate <= endOfMonth(selectedMonth)
payableThisMonth = countsThisMonth ? totalThisPeriod : 0
status           = countsThisMonth ? R8(dueDate) : 'Chưa đến kỳ'
```

### 5.6 Hàm RATE (giống Excel) — R9

```ts
/** Lãi suất mỗi kỳ r sao cho pv = pmt * (1 - (1+r)^-n) / r. Newton–Raphson. */
export function rate(n: number, pmt: number, pv: number, guess = 0.01): number {
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const f  = pmt * (1 - Math.pow(1 + r, -n)) / r - pv;
    const df = pmt * (n * Math.pow(1 + r, -n - 1) / r - (1 - Math.pow(1 + r, -n)) / (r * r));
    const next = r - f / df;
    if (Math.abs(next - r) < 1e-12) return next;
    r = next;
  }
  return r;
}
nominalAnnual   = rate(periods, installment, principal) * 12
effectiveAnnual = rate(periods, installment + collectionFee, netReceived) * 12
```

### 5.7 Tổng hợp tháng đang xem

Các dòng (theo thứ tự):

| Dòng | Ngày đến hạn | Phải trả | Dư nợ |
|---|---|---|---|
| Sacombank – Thẻ | `sac.dueDate` | `sac.currentDebt` | `sac.currentDebt` |
| Sacombank – Vay tiêu dùng | ngày 19 | `sacombankLoansDueThisMonth` | `sum(principalRemaining)` |
| VIB – Thẻ (gồm vay) | `vib.dueDate` | `vib.currentDebt` | `vibTotalDebt` |
| Mỗi khoản vay công ty TC | `dueDate` | `payableThisMonth` | `remainingTotal` |

```ts
totalPayable     = sum(rows.payable)
unpaidThisMonth  = sum(rows where status !== 'Đã trả' of planned)
dueSoonOrOverdue = count(status in ['Sắp đến hạn', 'Quá hạn'])
totalDebt        = sum(rows.debt)

cashTotal = sum(cash.amount)
leftover  = cashTotal - unpaidThisMonth
verdict   = cashTotal === 0 ? 'Nhập tiền hiện có'
          : leftover >= 0 ? 'Đủ tiền trả nợ' : `Thiếu ${format(-leftover)} ₫`
```

### 5.8 Giả định tháng sau (R10)

```ts
next = selectedMonth + 1 tháng

Sacombank thẻ:  dueDate = addMonths(sac.dueDate, 1),  payable = nextMonth.newSpendingSacombank
Sacombank vay:  dueDate = day19(next),                payable = sum(dueIn(loan, next))
VIB thẻ:        dueDate = addMonths(vib.dueDate, 1),
                payable = sum(vibLoans: remainingPeriods - 1 > 0 ? totalPerPeriod : 0)
                          + nextMonth.newSpendingVib
Vay công ty TC: dueInSelectedMonth = dueDate <= endOfMonth(selectedMonth)
                nextDue   = dueInSelectedMonth ? addMonths(dueDate, 1) : dueDate
                remaining = remainingPeriods - (dueInSelectedMonth ? 1 : 0)
                payable   = (nextDue <= endOfMonth(next) && remaining > 0) ? totalThisPeriod : 0

totalNext = sum(payable)
leftover  = nextMonth.cashAvailable - totalNext
```

---

## 6. Dữ liệu mẫu (seed) — số liệu thật hiện tại

```json
{
  "selectedMonth": "2026-11",
  "cards": [
    { "id": "sacombank", "name": "Sacombank", "creditLimit": 30000000, "currentDebt": 8366746,
      "statementDate": "2026-10-10", "dueDate": "2026-11-05", "statementBalance": 7891193,
      "paid": false, "annualInterestRate": 0.30 },
    { "id": "vib", "name": "VIB", "creditLimit": 28800000, "currentDebt": 7246783,
      "statementDate": "2026-09-25", "dueDate": "2026-11-10", "statementBalance": 7246783,
      "paid": false }
  ],
  "sacombankLoans": [
    { "id": "sac-1", "name": "Vay tiêu dùng", "startDate": "2026-05-20", "principal": 8000000, "periods": 5, "monthlyRate": 0.012,  "periodsPaid": 4 },
    { "id": "sac-2", "name": "Vay tiêu dùng", "startDate": "2026-08-12", "principal": 6000000, "periods": 3, "monthlyRate": 0.012,  "periodsPaid": 2 },
    { "id": "sac-3", "name": "Vay tiêu dùng", "startDate": "2026-09-28", "principal": 6000000, "periods": 2, "monthlyRate": 0.012,  "periodsPaid": 0 },
    { "id": "sac-4", "name": "Vay tiêu dùng", "startDate": "2026-10-26", "principal": 6000000, "periods": 3, "monthlyRate": 0.0127, "periodsPaid": 0 }
  ],
  "sacombankLoansPaidThisMonth": false,
  "vibLoans": [
    { "id": "vib-1", "name": "Trả góp", "startDate": "2026-10-06", "principal": 17648053, "periods": 9, "monthlyRate": 0, "periodsPaid": 1 }
  ],
  "financeLoans": [
    { "id": "shinhan-1", "lender": "Shinhan Finance", "label": "Khoản vay 1", "principal": 50000000, "annualRate": 0.415,
      "periods": 12, "periodsPaid": 4, "installment": 5089434, "collectionFee": 12000, "dueDate": "2026-11-15", "paid": false },
    { "id": "shinhan-2", "lender": "Shinhan Finance", "label": "Vay 20tr / 12 tháng (khoản 2)", "principal": 20000000,
      "netReceived": 18850000, "periods": 12, "periodsPaid": 0, "installment": 2059000, "collectionFee": 12000,
      "dueDate": "2026-12-15", "paid": false,
      "note": "Thực nhận ~18,8–18,9tr (bảo hiểm bị trừ). Đóng từ tháng 12, ngày 15 là tạm tính." },
    { "id": "sfinance-1", "lender": "SFinance", "label": "Khoản vay", "principal": 20000000, "annualRate": 0.29,
      "periods": 36, "periodsPaid": 28, "installment": 913000, "collectionFee": 0, "dueDate": "2026-11-19", "paid": false }
  ],
  "cash": [
    { "id": "bank",   "label": "Tài khoản ngân hàng",          "amount": 2000000 },
    { "id": "cash",   "label": "Tiền mặt",                      "amount": 600000 },
    { "id": "salary", "label": "Lương / thu nhập trong tháng",  "amount": 14500000 },
    { "id": "other1", "label": "Nguồn khác 1",                  "amount": 19000000 }
  ],
  "nextMonth": { "newSpendingSacombank": 0, "newSpendingVib": 0, "cashAvailable": 20000000 }
}
```

---

## 7. Kết quả mong đợi (dùng làm unit test)

Ngày "hôm nay" trong test: **2026-11-04**.

### 7.1 Tháng 11/2026

| Kiểm tra | Giá trị |
|---|---|
| Sacombank hạn mức còn lại | 6.033.254 |
| Sacombank tỷ lệ sử dụng | 79,9% |
| VIB hạn mức còn lại | 7.826.954 |
| VIB tỷ lệ sử dụng | 72,8% |
| Vay Sacombank – kỳ đầu sac-1 / sac-2 / sac-3 / sac-4 | 19/07 · 19/09 · 19/11 · 19/12/2026 |
| Vay Sacombank – kỳ tháng 11 | 5/5 · 3/3 · 1/2 · Chưa đến kỳ |
| Vay Sacombank – phải trả 19/11 | 1.696.000 + 2.072.000 + 3.072.000 + 0 = **6.840.000** |
| Vay Sacombank – gốc còn lại | **15.600.000** |
| Vay VIB – kỳ này / gốc còn lại | 1.960.895 (kỳ 2/9) · 15.687.158 |
| Shinhan 1 – phải trả | 5.089.434 + 12.000 = **5.101.434** |
| Shinhan 2 – tháng 11 | 0 ("Chưa đến kỳ") |
| Shinhan 2 – lãi danh nghĩa / thực tế | **40,9% / 54,4%** mỗi năm |
| SFinance – phải trả | **913.000** |
| **Tổng phải trả tháng 11** | **28.467.963** |
| **Tổng dư nợ** | **117.907.264** |
| Trạng thái Sacombank thẻ (đến hạn 05/11) | Sắp đến hạn (còn 1 ngày) |
| Tiền hiện có / còn lại | 36.100.000 / **7.632.037** → "Đủ tiền trả nợ" |

Chi tiết tổng dư nợ: 8.366.746 (thẻ Sacombank) + 15.600.000 (vay Sacombank) + 20.973.046 (VIB = 7.246.783 + 13.726.263) + 40.811.472 (Shinhan 1) + 24.852.000 (Shinhan 2) + 7.304.000 (SFinance).

### 7.2 Giả định tháng 12/2026

| Khoản | Đến hạn | Phải đóng |
|---|---|---|
| Sacombank – Thẻ | 05/12 | 0 (không chi tiêu mới) |
| Sacombank – Vay (sac-1 hoàn tất, sac-2 hoàn tất, sac-3 2/2, sac-4 1/3) | 19/12 | 3.072.000 + 2.076.200 = **5.148.200** |
| VIB – Thẻ (vay kỳ 3/9) | 10/12 | **1.960.895** |
| Shinhan 1 | 15/12 | **5.101.434** |
| Shinhan 2 (kỳ đầu) | 15/12 | **2.071.000** |
| SFinance | 19/12 | **913.000** |
| **Tổng** | | **15.194.529** |
| Tiền có 20.000.000 → còn lại | | **4.805.471** |

---

## 8. Màn hình đề xuất

1. **Tổng hợp** (trang chủ): chọn tháng, bảng các khoản phải trả với badge trạng thái (xanh = Đã trả, vàng = Sắp đến hạn, đỏ = Quá hạn), nút đánh dấu "Đã trả", tổng phải trả, tổng dư nợ, khối "Tiền hiện có" (thêm/sửa nguồn tiền) và kết luận Đủ/Thiếu.
2. **Thẻ tín dụng**: 2 thẻ dạng card — hạn mức, dư nợ, hạn mức còn lại, thanh tiến độ tỷ lệ sử dụng (đỏ khi > 30%), ngày sao kê/đến hạn, số ngày còn lại.
3. **Vay Sacombank**: bảng khoản vay + form thêm khoản (chỉ cần ngày mở, gốc, số kỳ, %/tháng); hiện kỳ đầu, kỳ cuối, kỳ tháng này, cảnh báo "Lệch" ở cột kiểm tra.
4. **Vay VIB**: tương tự, gọn hơn.
5. **Vay công ty tài chính**: bảng + form; tự tính lãi danh nghĩa/thực tế khi có số tiền mỗi kỳ và tiền thực nhận.
6. **Giả định tháng sau**: 3 ô nhập (chi tiêu mới Sacombank, chi tiêu mới VIB, tiền có tháng sau) + bảng kết quả + chi tiết vay Sacombank/VIB tháng sau.
7. **Cài đặt**: Xuất/Nhập JSON, xoá dữ liệu.

## 9. Cấu trúc thư mục gợi ý

```
src/
  domain/
    types.ts          // các interface ở mục 3
    dates.ts          // addMonths, endOfMonth, monthsBetween, daysUntil
    finance.ts        // rate(), lãi danh nghĩa/thực tế
    cards.ts          // R1, R4, R5
    sacombankLoans.ts // R2, R3
    vibLoans.ts
    financeLoans.ts   // R6, R7
    summary.ts        // 5.7
    nextMonth.ts      // 5.8
    __tests__/        // test theo mục 7
  store/useAppState.ts  // state + localStorage
  seed.ts               // dữ liệu mục 6
  pages/ ...            // các màn hình mục 8
```

## 10. Lưu ý khi viết app

- Mọi số tiền là **số nguyên VND**; làm tròn khi hiển thị, không làm tròn giữa chừng khi tính.
- "Số kỳ đã trả" là dữ liệu người dùng nhập; app **không tự tăng** khi đánh dấu "Đã trả" (giống Excel). Có thể thêm nút "Sang tháng mới" để: tăng `periodsPaid` của các khoản đã trả, đẩy `dueDate` thêm 1 tháng, reset cờ `paid`, và chuyển `selectedMonth` sang tháng sau — nhưng phải xác nhận với người dùng trước.
- Trạng thái phụ thuộc "hôm nay" → truyền `today` vào các hàm domain để test được.
- Ngày đến hạn 15/12 của Shinhan khoản 2 là tạm tính — để người dùng sửa được.
