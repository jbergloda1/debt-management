import type { Engine } from './engine';
import { sumBy } from './money';
import type { CreditLine, ID, Money, YearMonth } from './types';

export interface CreditLineUsage {
  line: CreditLine;
  limit: Money;
  used: Money;
  available: Money;
  utilization: number;
  breakdown: { obligationId: ID; label: string; amount: Money; kind: 'card' | 'linked' }[];
}

/** Mục 7: hạn mức khả dụng = hạn mức − dư nợ thẻ − phần các khoản dùng chung chiếm dụng. */
export function creditLineUsage(engine: Engine, lineId: ID, month: YearMonth): CreditLineUsage | undefined {
  const line = engine.state.creditLines.find((l) => l.id === lineId);
  if (!line) return undefined;
  const breakdown: CreditLineUsage['breakdown'] = [];

  for (const ob of engine.statementBased()) {
    if (ob.creditLineId !== lineId) continue;
    breakdown.push({ obligationId: ob.id, label: ob.name, amount: engine.cardBalance(ob, month), kind: 'card' });
  }

  for (const loan of engine.loans()) {
    const link = loan.link;
    if (!link?.sharesCreditLimit) continue;
    const parent = link.parentObligationId ? engine.obligation(link.parentObligationId) : undefined;
    const lid = link.creditLineId ?? (parent && 'creditLineId' in parent ? parent.creditLineId : undefined);
    if (lid !== lineId) continue;
    const amount =
      link.billedIntoStatement && parent && (parent.kind === 'credit_card' || parent.kind === 'revolving')
        ? engine.unbilledPrincipal(loan, engine.cycleMonth(parent, month))
        : engine.ledger(loan).principalRemaining;
    breakdown.push({ obligationId: loan.id, label: loan.name, amount, kind: 'linked' });
  }

  const used = sumBy(breakdown, (b) => b.amount);
  const available = line.limit - used;
  return {
    line,
    limit: line.limit,
    used,
    available,
    utilization: line.limit > 0 ? used / line.limit : 0,
    breakdown,
  };
}
