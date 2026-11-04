import { creditLineUsage } from './creditLine';
import { daysUntil, formatDate } from './dates';
import { expectedCardDueDate } from './dueItems';
import type { Engine } from './engine';
import { expectedPaidAt } from './ledger';
import { hasBrokenLink } from './links';
import { loanMetrics } from './metrics';
import { roundMoney } from './money';
import type { MonthlySummary } from './summary';
import type { ID, ISODate, Money, YearMonth } from './types';

export type AlertCode =
  | 'DUE_SOON'
  | 'OVERDUE'
  | 'HIGH_UTILIZATION'
  | 'OVER_LIMIT'
  | 'PERIOD_MISMATCH'
  | 'CASH_SHORT'
  | 'HIGH_APR'
  | 'MINIMUM_POLICY_INTEREST'
  | 'MISSING_STATEMENT'
  | 'ESTIMATED_DATE'
  | 'LINK_MISSING_CARD';

export interface Alert {
  code: AlertCode;
  level: 'error' | 'warning' | 'info';
  message: string;
  obligationId?: ID;
  creditLineId?: ID;
  date?: ISODate;
  amount?: Money;
}

const LEVEL_ORDER = { error: 0, warning: 1, info: 2 };

/** Mục 14 — `fmt` định dạng tiền theo profile. */
export function alerts(engine: Engine, month: YearMonth, summary: MonthlySummary, fmt: (m: Money) => string): Alert[] {
  const { state, today } = engine;
  const settings = state.profile.settings;
  const out: Alert[] = [];
  const nameOf = (id: ID) => engine.obligation(id)?.name ?? id;

  for (const it of summary.items) {
    if (it.includedIn) continue;
    const label = `${nameOf(it.obligationId)} (${it.label})`;
    if (it.state === 'overdue' || (it.state === 'partial' && it.dueDate < today)) {
      out.push({
        code: 'OVERDUE',
        level: 'error',
        message: `${label} quá hạn ${-daysUntil(it.dueDate, today)} ngày, còn thiếu ${fmt(it.amount - it.paidAmount)}`,
        obligationId: it.obligationId,
        date: it.dueDate,
      });
    } else if (it.state === 'due_soon') {
      const d = daysUntil(it.dueDate, today);
      out.push({
        code: 'DUE_SOON',
        level: 'warning',
        message: `${label} đến hạn ${d === 0 ? 'hôm nay' : `sau ${d} ngày`} (${formatDate(it.dueDate)}): ${fmt(it.amount - it.paidAmount)}`,
        obligationId: it.obligationId,
        date: it.dueDate,
      });
    }
  }

  for (const line of state.creditLines) {
    const u = creditLineUsage(engine, line.id, month);
    if (!u) continue;
    if (u.available < 0) {
      out.push({ code: 'OVER_LIMIT', level: 'error', message: `${line.name} vượt hạn mức ${fmt(-u.available)}`, creditLineId: line.id });
    } else if (u.utilization > settings.utilizationWarning) {
      out.push({
        code: 'HIGH_UTILIZATION',
        level: 'warning',
        message: `${line.name} đã dùng ${Math.round(u.utilization * 100)}% hạn mức (ngưỡng ${Math.round(settings.utilizationWarning * 100)}%)`,
        creditLineId: line.id,
      });
    }
  }

  for (const loan of engine.loans()) {
    if (hasBrokenLink(loan, state)) {
      out.push({
        code: 'LINK_MISSING_CARD',
        level: 'error',
        message: `${loan.name}: đánh dấu nằm trong sao kê / dùng chung hạn mức nhưng chưa gắn thẻ — chưa trừ vào hạn mức. Mở Sửa và chọn thẻ ở "Gắn vào thẻ"`,
        obligationId: loan.id,
      });
    }
    if (loan.opening) {
      const expected = expectedPaidAt(engine.schedule(loan), loan.opening.asOf);
      if (expected !== loan.opening.periodsPaid) {
        out.push({
          code: 'PERIOD_MISMATCH',
          level: 'warning',
          message: `${loan.name}: nhập đã trả ${loan.opening.periodsPaid} kỳ tại ${formatDate(loan.opening.asOf)}, theo lịch là ${expected} kỳ`,
          obligationId: loan.id,
        });
      }
    }
    const m = loanMetrics(loan, engine.institution(loan.institutionId), settings);
    if (Number.isFinite(m.effectiveAPR) && m.effectiveAPR > settings.highAprThreshold) {
      out.push({
        code: 'HIGH_APR',
        level: 'info',
        message: `${loan.name}: lãi thực tế ${(m.effectiveAPR * 100).toFixed(1)}%/năm (ngưỡng ${Math.round(settings.highAprThreshold * 100)}%)`,
        obligationId: loan.id,
      });
    }
  }

  for (const card of engine.statementBased()) {
    const hasStatement = engine.statements(card.id).some((s) => s.dueDate.startsWith(month));
    const expected = expectedCardDueDate(card, month);
    if (!hasStatement && expected && card.status === 'active') {
      out.push({
        code: 'MISSING_STATEMENT',
        level: 'info',
        message: `${card.name}: chưa nhập sao kê cho kỳ đến hạn ${formatDate(expected)}`,
        obligationId: card.id,
      });
    }
    if (card.kind === 'credit_card' && engine.policyOf(card) === 'minimum') {
      const st = engine.currentStatement(card.id, month);
      if (st) {
        const pay = engine.statementAmount(card, st);
        const interest = roundMoney(((st.statementBalance - pay) * (card.annualRate ?? 0.3)) / 12);
        if (interest > 0) {
          out.push({
            code: 'MINIMUM_POLICY_INTEREST',
            level: 'warning',
            message: `${card.name}: trả tối thiểu ${fmt(pay)} sẽ phát sinh lãi khoảng ${fmt(interest)}/tháng`,
            obligationId: card.id,
            amount: interest,
          });
        }
      }
    }
  }

  for (const ob of engine.open()) {
    if (!ob.dueDateEstimated) continue;
    const row = summary.rows.find((r) => r.memberIds.includes(ob.id));
    out.push({
      code: 'ESTIMATED_DATE',
      level: 'info',
      message: `${ob.name}: ngày đến hạn ${row?.dueDate ? formatDate(row.dueDate) : ''} là tạm tính — hãy xác nhận với tổ chức cho vay`,
      obligationId: ob.id,
    });
  }

  const cash = summary.cash;
  if (cash.verdict === 'short') {
    out.push({ code: 'CASH_SHORT', level: 'error', message: `Tiền hiện có thiếu ${fmt(cash.shortBy ?? 0)} để trả nợ và chi tiêu tháng này` });
  } else if (cash.verdict === 'short_temporarily') {
    out.push({
      code: 'CASH_SHORT',
      level: 'error',
      message: `Thiếu tạm thời ${fmt(cash.shortBy ?? 0)} vào ngày ${formatDate(cash.shortDate)} (tiền về sau ngày đến hạn)`,
      date: cash.shortDate,
    });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
