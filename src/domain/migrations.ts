import { addDays, addMonths, addMonthsYM, dayOf, endOfMonth, monthOf, setDay, startOfMonth } from './dates';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS, newId } from './defaults';
import type { V1AppState } from './legacy/v1';
import { generateDueDates } from './rules';
import { creditLineNameFor, repairLinks } from './links';
import type { DueDateRule, Institution, Obligation, Payment, ProfileState, Statement } from './types';
import { formatZodError, profileStateSchema } from './validation';

/** migrations[k] nâng dữ liệu từ phiên bản k−1 lên k (P7). */
const migrations: Record<number, (s: any) => any> = {
  1: (s) => ({
    ...s,
    plannedAmounts: s.plannedAmounts ?? {},
    payments: s.payments ?? [],
    statements: s.statements ?? [],
    scenarios: s.scenarios ?? [],
    profile: { ...s.profile, settings: { ...DEFAULT_SETTINGS, ...s.profile?.settings } },
  }),
  // Gắn lại thẻ cho trả góp tạo từ mẫu preset (thiếu thẻ → không trừ hạn mức); tên hạn mức theo tên thẻ
  2: (s) => repairLinks(s).state,
  // Thêm chi tiêu
  3: (s) => ({ ...s, expenses: s.expenses ?? [] }),
  // Hạn trả thẻ VIB = ngày sao kê + 15 ngày (không cố định ngày 10)
  4: (s) => fixVibDueRule(s),
};

const OLD_VIB_RULE: DueDateRule = { type: 'statement_fixed_due', statementDay: 25, dueDay: 10 };
const VIB_RULE: DueDateRule = { type: 'statement_offset', statementDay: 25, daysAfterStatement: 15 };
const sameRule = (a: DueDateRule | undefined, b: DueDateRule) => !!a && JSON.stringify(a) === JSON.stringify(b);

/**
 * Bản trước mặc định thẻ VIB "sao kê 25, đến hạn ngày 10" (theo mẫu preset / dữ liệu v1); theo thông báo dư nợ
 * thật, VIB tính hạn = ngày sao kê + 15 ngày (25/09 → 10/10, 25/10 → 09/11). Chỉ đổi thẻ của tổ chức tên VIB
 * còn giữ đúng quy tắc cũ, các trả góp gắn vào thẻ đó, và hạn của sao kê đã lưu nếu khớp quy tắc cũ.
 */
export function fixVibDueRule(s: ProfileState): ProfileState {
  const vibInst = new Set(s.institutions.filter((i) => /\bvib\b/i.test(i.name)).map((i) => i.id));
  const cards = new Set(
    s.obligations.filter((o) => o.kind === 'credit_card' && vibInst.has(o.institutionId) && sameRule(o.dueRule, OLD_VIB_RULE)).map((o) => o.id),
  );
  if (!cards.size) return s;
  const oldDue = (statementDate: string) => setDay(addMonthsYM(monthOf(statementDate), 1), 10);
  return {
    ...s,
    institutions: s.institutions.map((i) =>
      vibInst.has(i.id) && sameRule(i.defaults?.dueDateRule, OLD_VIB_RULE) ? { ...i, defaults: { ...i.defaults, dueDateRule: VIB_RULE } } : i,
    ),
    obligations: s.obligations.map((o) =>
      cards.has(o.id) ||
      (o.kind === 'installment_loan' && cards.has(o.link?.parentObligationId ?? '') && sameRule(o.dueRule, OLD_VIB_RULE))
        ? { ...o, dueRule: VIB_RULE }
        : o,
    ),
    statements: s.statements.map((st) =>
      cards.has(st.obligationId) && dayOf(st.statementDate) === 25 && st.dueDate === oldDue(st.statementDate)
        ? { ...st, dueDate: addDays(st.statementDate, 15) }
        : st,
    ),
  };
}

export const isLegacyV1 = (raw: any): raw is V1AppState =>
  !!raw && typeof raw === 'object' && typeof raw.selectedMonth === 'string' && Array.isArray(raw.cards) && !raw.profile;

export interface MigrationResult {
  state: ProfileState;
  from?: number | 'legacy-v1';
}

/** Chạy tuần tự các migration rồi kiểm tra schema (zod). Ném lỗi nếu dữ liệu không hợp lệ. */
export function migrate(raw: unknown): MigrationResult {
  if (isLegacyV1(raw)) return { state: validate(fixVibDueRule(fromLegacyV1(raw))), from: 'legacy-v1' };
  const s = raw as any;
  const from = typeof s?.schemaVersion === 'number' ? s.schemaVersion : 0;
  if (from > CURRENT_SCHEMA_VERSION) throw new Error(`Dữ liệu từ phiên bản mới hơn (${from}) — hãy cập nhật app`);
  let cur = s;
  for (let v = from + 1; v <= CURRENT_SCHEMA_VERSION; v++) cur = migrations[v](cur);
  cur = { ...cur, schemaVersion: CURRENT_SCHEMA_VERSION, profile: { ...cur.profile, schemaVersion: CURRENT_SCHEMA_VERSION } };
  return { state: validate(cur), from: from === CURRENT_SCHEMA_VERSION ? undefined : from };
}

function validate(s: unknown): ProfileState {
  const r = profileStateSchema.safeParse(s);
  if (!r.success) throw new Error(`Dữ liệu không hợp lệ:\n${formatZodError(r.error)}`);
  return r.data as ProfileState;
}

/**
 * Chuyển dữ liệu của app v1 (debt-manager-spec.md) sang mô hình v2.
 * "Số kỳ đã trả" của v1 thành opening; ngày giải ngân của khoản vay công ty tài chính / VIB được
 * suy ngược từ ngày đến hạn hiện tại để lịch khớp với số kỳ đã trả.
 */
export function fromLegacyV1(v1: V1AppState): ProfileState {
  const pid = newId('profile');
  const ym = v1.selectedMonth;
  const asOf = startOfMonth(ym);
  const base = { profileId: pid, status: 'active' as const, createdAt: asOf };
  const institutions = new Map<string, Institution>();
  const instFor = (name: string, type: Institution['type']) => {
    const key = name.trim().toLowerCase();
    if (!institutions.has(key)) institutions.set(key, { id: newId('inst'), name, type });
    return institutions.get(key)!;
  };

  const obligations: Obligation[] = [];
  const statements: Statement[] = [];
  const payments: Payment[] = [];
  const plannedAmounts: Record<string, number> = {};
  const creditLines: ProfileState['creditLines'] = [];
  const cardIds = new Map<string, string>();

  for (const c of v1.cards) {
    const inst = instFor(c.name, 'bank');
    const lineId = newId('cl');
    const cardId = newId('card');
    cardIds.set(c.id, cardId);
    creditLines.push({ id: lineId, institutionId: inst.id, name: creditLineNameFor(`Thẻ ${c.name}`), limit: c.creditLimit });
    const statementDay = dayOf(c.statementDate);
    obligations.push({
      ...base,
      id: cardId,
      kind: 'credit_card',
      institutionId: inst.id,
      creditLineId: lineId,
      name: `Thẻ ${c.name}`,
      statementDay,
      dueRule: { type: 'statement_fixed_due', statementDay, dueDay: dayOf(c.dueDate) },
      annualRate: c.annualInterestRate,
      paymentPolicy: 'current_balance',
      note: c.note,
    });
    const st: Statement = {
      id: newId('st'),
      obligationId: cardId,
      statementDate: c.statementDate,
      dueDate: c.dueDate,
      statementBalance: c.statementBalance,
      currentBalance: c.currentDebt,
      capturedAt: asOf,
    };
    statements.push(st);
    const key = `${cardId}:${st.id}`;
    if (c.plannedPayment !== undefined) plannedAmounts[key] = c.plannedPayment;
    if (c.paid) payments.push({ id: newId('pay'), obligationId: cardId, dueItemKey: key, date: asOf, amount: c.currentDebt, note: 'Từ v1' });
  }

  const sacCard = v1.cards.find((c) => c.id === 'sacombank');
  const sacRule: DueDateRule = { type: 'fixed_day', day: 19, cutoffDay: 19, offsetIfOnOrBeforeCutoff: 1, offsetIfAfterCutoff: 2 };
  if (v1.sacombankLoans.length) {
    const inst = instFor(sacCard?.name ?? 'Sacombank', 'bank');
    inst.defaults = { dueDateRule: sacRule, interestModel: { type: 'flat_monthly', monthlyRate: 0.012 } };
  }
  for (const l of v1.sacombankLoans) {
    const inst = instFor(sacCard?.name ?? 'Sacombank', 'bank');
    const parent = sacCard ? cardIds.get(sacCard.id) : undefined;
    const id = newId('loan');
    obligations.push({
      ...base,
      id,
      kind: 'installment_loan',
      institutionId: inst.id,
      name: l.name,
      principal: l.principal,
      startDate: l.startDate,
      periods: l.periods,
      interestModel: { type: 'flat_monthly', monthlyRate: l.monthlyRate },
      dueRule: sacRule,
      link: parent
        ? { parentObligationId: parent, creditLineId: creditLines.find((x) => x.institutionId === inst.id)?.id, sharesCreditLimit: true, billedIntoStatement: false }
        : undefined,
      opening: { asOf, periodsPaid: l.periodsPaid },
      note: l.note,
    });
    if (v1.sacombankLoansPaidThisMonth && l.periodsPaid < l.periods) {
      const amount = Math.round(l.principal / l.periods) + Math.round(l.principal * l.monthlyRate);
      payments.push({ id: newId('pay'), obligationId: id, dueItemKey: `${id}:${l.periodsPaid + 1}`, date: asOf, amount, note: 'Từ v1' });
    }
  }

  const vibCard = v1.cards.find((c) => c.id === 'vib');
  for (const l of v1.vibLoans) {
    const inst = instFor(vibCard?.name ?? 'VIB', 'bank');
    const parent = vibCard ? cardIds.get(vibCard.id) : undefined;
    const statementDay = vibCard ? dayOf(vibCard.statementDate) : 25;
    const dueDay = vibCard ? dayOf(vibCard.dueDate) : 10;
    const dueMonth = vibCard ? monthOf(vibCard.dueDate) : ym;
    const dueRule: DueDateRule = { type: 'statement_fixed_due', statementDay, dueDay };
    // Với trả góp gộp sao kê, "số kỳ" của v1 là số kỳ ĐÃ LÊN SAO KÊ (gồm kỳ trong sao kê đang chờ trả),
    // nên kỳ thứ `billed` đến hạn cùng thẻ trong dueMonth và số kỳ đã trả thật = billed − 1.
    const billed = l.periodsPaid;
    const firstDueMonth = addMonthsYM(dueMonth, 1 - billed);
    const offset = dueDay > statementDay ? 0 : 1;
    const keepStart = monthOf(generateDueDates(dueRule, l.startDate, 1)[0]) === firstDueMonth;
    obligations.push({
      ...base,
      id: newId('loan'),
      kind: 'installment_loan',
      institutionId: inst.id,
      name: l.name,
      principal: l.principal,
      startDate: keepStart ? l.startDate : setDay(addMonthsYM(firstDueMonth, -offset), statementDay),
      periods: l.periods,
      interestModel: l.monthlyRate > 0 ? { type: 'flat_monthly', monthlyRate: l.monthlyRate } : { type: 'zero_interest' },
      dueRule,
      link: parent
        ? { parentObligationId: parent, creditLineId: creditLines.find((x) => x.institutionId === inst.id)?.id, sharesCreditLimit: true, billedIntoStatement: true }
        : undefined,
      opening: billed > 1 ? { asOf, periodsPaid: billed - 1 } : undefined,
      note: [l.note, keepStart ? '' : `Ngày mở theo v1: ${l.startDate}`].filter(Boolean).join(' · ') || undefined,
    });
  }

  for (const l of v1.financeLoans) {
    const inst = instFor(l.lender, 'finance_company');
    const id = newId('loan');
    const due = l.dueDate ?? setDay(ym, 15);
    obligations.push({
      ...base,
      id,
      kind: 'installment_loan',
      institutionId: inst.id,
      name: `${l.lender} – ${l.label}`,
      principal: l.principal,
      netDisbursed: l.netReceived,
      startDate: addMonths(due, -(l.periodsPaid + 1)),
      periods: l.periods,
      interestModel: { type: 'fixed_installment', installment: l.installment },
      dueRule: { type: 'same_day_as_start', offsetMonths: 1 },
      perPeriodFees: l.collectionFee
        ? [{ id: 'fee-collection', name: 'Phí thu hộ', timing: 'per_period', amount: { type: 'fixed', value: l.collectionFee } }]
        : [],
      opening: l.periodsPaid ? { asOf, periodsPaid: l.periodsPaid } : undefined,
      dueDateEstimated: !l.dueDate || /tạm tính/i.test(l.note ?? ''),
      note: l.note,
    });
    if (l.paid && due <= endOfMonth(ym)) {
      payments.push({
        id: newId('pay'),
        obligationId: id,
        dueItemKey: `${id}:${l.periodsPaid + 1}`,
        date: asOf,
        amount: l.installment + l.collectionFee,
        note: 'Từ v1',
      });
    }
  }

  const next = addMonthsYM(ym, 1);
  const cardMonthlySpending: Record<string, number> = {};
  if (sacCard && v1.nextMonth.newSpendingSacombank) cardMonthlySpending[cardIds.get(sacCard.id)!] = v1.nextMonth.newSpendingSacombank;
  if (vibCard && v1.nextMonth.newSpendingVib) cardMonthlySpending[cardIds.get(vibCard.id)!] = v1.nextMonth.newSpendingVib;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: {
      id: pid,
      name: 'Của tôi (từ v1)',
      currency: 'VND',
      locale: 'vi-VN',
      settings: { ...DEFAULT_SETTINGS },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    institutions: [...institutions.values()],
    creditLines,
    obligations,
    statements,
    payments,
    plannedAmounts,
    cashAccounts: v1.cash.map((c) => ({ id: newId('acc'), name: c.label, balance: c.amount, updatedAt: asOf })),
    incomes: [],
    expenses: [],
    scenarios: [
      {
        id: newId('scn'),
        name: 'Từ v1',
        horizonMonths: 12,
        assumeAllPaidOnTime: true,
        cardMonthlySpending,
        incomeOverrides: { [next]: v1.nextMonth.cashAvailable },
      },
    ],
    viewMonth: ym,
  };
}
