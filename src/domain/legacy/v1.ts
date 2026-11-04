/** Kiểu dữ liệu & dữ liệu mẫu của app v1 (debt-manager-spec.md) — chỉ dùng để migrate. */
export type ISODate = string; // 'YYYY-MM-DD'
export type YearMonth = string; // 'YYYY-MM'

export interface CreditCard {
  id: 'sacombank' | 'vib' | string;
  name: string;
  creditLimit: number;
  currentDebt: number;
  statementDate: ISODate;
  dueDate: ISODate;
  statementBalance: number;
  plannedPayment?: number;
  paid: boolean;
  annualInterestRate?: number;
  note?: string;
}

/** Vay tiêu dùng Sacombank – dùng chung hạn mức thẻ Sacombank, trả cố định ngày 19 */
export interface SacombankLoan {
  id: string;
  name: string;
  startDate: ISODate;
  principal: number;
  periods: number;
  monthlyRate: number;
  periodsPaid: number;
  note?: string;
}

/** Khoản vay/trả góp trên thẻ VIB – kỳ trả nằm trong dư nợ sao kê VIB */
export interface VibLoan {
  id: string;
  name: string;
  startDate: ISODate;
  principal: number;
  periods: number;
  monthlyRate: number;
  periodsPaid: number;
  note?: string;
}

/** Vay công ty tài chính (Shinhan Finance, SFinance, ...) */
export interface FinanceLoan {
  id: string;
  lender: string;
  label: string;
  principal: number;
  annualRate?: number;
  netReceived?: number;
  periods: number;
  periodsPaid: number;
  installment: number;
  collectionFee: number;
  dueDate?: ISODate;
  paid: boolean;
  note?: string;
}

export interface CashSource {
  id: string;
  label: string;
  amount: number;
}

export interface V1AppState {
  selectedMonth: YearMonth;
  cards: CreditCard[];
  sacombankLoans: SacombankLoan[];
  sacombankLoansPaidThisMonth: boolean;
  vibLoans: VibLoan[];
  financeLoans: FinanceLoan[];
  cash: CashSource[];
  nextMonth: {
    newSpendingSacombank: number;
    newSpendingVib: number;
    cashAvailable: number;
  };
}



/** Dữ liệu mẫu – mục 6 của đặc tả */
export const v1Seed: V1AppState = {
  selectedMonth: '2026-11',
  cards: [
    {
      id: 'sacombank', name: 'Sacombank', creditLimit: 30000000, currentDebt: 8366746,
      statementDate: '2026-10-10', dueDate: '2026-11-05', statementBalance: 7891193,
      paid: false, annualInterestRate: 0.3,
    },
    {
      id: 'vib', name: 'VIB', creditLimit: 28800000, currentDebt: 7246783,
      statementDate: '2026-09-25', dueDate: '2026-11-10', statementBalance: 7246783,
      paid: false,
    },
  ],
  sacombankLoans: [
    { id: 'sac-1', name: 'Vay tiêu dùng', startDate: '2026-05-20', principal: 8000000, periods: 5, monthlyRate: 0.012, periodsPaid: 4 },
    { id: 'sac-2', name: 'Vay tiêu dùng', startDate: '2026-08-12', principal: 6000000, periods: 3, monthlyRate: 0.012, periodsPaid: 2 },
    { id: 'sac-3', name: 'Vay tiêu dùng', startDate: '2026-09-28', principal: 6000000, periods: 2, monthlyRate: 0.012, periodsPaid: 0 },
    { id: 'sac-4', name: 'Vay tiêu dùng', startDate: '2026-10-26', principal: 6000000, periods: 3, monthlyRate: 0.0127, periodsPaid: 0 },
  ],
  sacombankLoansPaidThisMonth: false,
  vibLoans: [
    { id: 'vib-1', name: 'Trả góp', startDate: '2026-10-06', principal: 17648053, periods: 9, monthlyRate: 0, periodsPaid: 1 },
  ],
  financeLoans: [
    {
      id: 'shinhan-1', lender: 'Shinhan Finance', label: 'Khoản vay 1', principal: 50000000, annualRate: 0.415,
      periods: 12, periodsPaid: 4, installment: 5089434, collectionFee: 12000, dueDate: '2026-11-15', paid: false,
    },
    {
      id: 'shinhan-2', lender: 'Shinhan Finance', label: 'Vay 20tr / 12 tháng (khoản 2)', principal: 20000000,
      netReceived: 18850000, periods: 12, periodsPaid: 0, installment: 2059000, collectionFee: 12000,
      dueDate: '2026-12-15', paid: false,
      note: 'Thực nhận ~18,8–18,9tr (bảo hiểm bị trừ). Đóng từ tháng 12, ngày 15 là tạm tính.',
    },
    {
      id: 'sfinance-1', lender: 'SFinance', label: 'Khoản vay', principal: 20000000, annualRate: 0.29,
      periods: 36, periodsPaid: 28, installment: 913000, collectionFee: 0, dueDate: '2026-11-19', paid: false,
    },
  ],
  cash: [
    { id: 'bank', label: 'Tài khoản ngân hàng', amount: 2000000 },
    { id: 'cash', label: 'Tiền mặt', amount: 600000 },
    { id: 'salary', label: 'Lương / thu nhập trong tháng', amount: 14500000 },
    { id: 'other1', label: 'Nguồn khác 1', amount: 19000000 },
  ],
  nextMonth: { newSpendingSacombank: 0, newSpendingVib: 0, cashAvailable: 20000000 },
};

