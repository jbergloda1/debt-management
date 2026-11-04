import type { InstallmentLoanObligation, Obligation, ProfileState, StatementBased } from './types';

export const creditLineNameFor = (cardName: string) => `Hạn mức ${cardName}`;

const isCard = (o: Obligation): o is StatementBased => (o.kind === 'credit_card' || o.kind === 'revolving') && o.status !== 'closed';

/**
 * Khoản vay khai báo nằm trong sao kê / dùng chung hạn mức nhưng không gắn được vào thẻ hay hạn mức nào
 * → app không trừ hạn mức và (nếu gộp sao kê) còn cộng riêng vào số phải trả.
 */
export function hasBrokenLink(loan: InstallmentLoanObligation, s: Pick<ProfileState, 'obligations' | 'creditLines'>): boolean {
  const link = loan.link;
  if (!link) return false;
  const parentOk = !!link.parentObligationId && s.obligations.some((o) => o.id === link.parentObligationId && isCard(o));
  const lineOk = !!link.creditLineId && s.creditLines.some((l) => l.id === link.creditLineId);
  return (link.billedIntoStatement && !parentOk) || (link.sharesCreditLimit && !parentOk && !lineOk);
}

/** Thẻ phù hợp duy nhất cho khoản vay, theo thứ tự: cùng tổ chức → cùng tên tổ chức → cùng chu kỳ sao kê. */
export function guessParentCard(loan: InstallmentLoanObligation, s: Pick<ProfileState, 'obligations' | 'institutions'>): StatementBased | undefined {
  const cards = s.obligations.filter(isCard);
  const instName = (id: string) => s.institutions.find((i) => i.id === id)?.name.trim().toLowerCase();
  const sameCycle = (c: StatementBased) =>
    'statementDay' in loan.dueRule && JSON.stringify(loan.dueRule) === JSON.stringify(c.dueRule);
  const levels = [
    cards.filter((c) => c.institutionId === loan.institutionId),
    cards.filter((c) => instName(c.institutionId) === instName(loan.institutionId)),
    cards.filter(sameCycle),
  ];
  for (const candidates of levels) {
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) return undefined; // mơ hồ → không đoán
  }
  return undefined;
}

/**
 * Sửa dữ liệu tạo từ mẫu preset (bản trước):
 * - khoản trả góp có liên kết nhưng thiếu thẻ → gắn thẻ nếu xác định được duy nhất;
 * - tên hạn mức theo tên thẻ (trước đây lấy tên mẫu lúc tạo và không đổi khi đổi tên thẻ).
 */
export function repairLinks(s: ProfileState): { state: ProfileState; attached: { loan: string; card: string }[] } {
  const attached: { loan: string; card: string }[] = [];
  const obligations = s.obligations.map((o) => {
    if (o.kind !== 'installment_loan' || !hasBrokenLink(o, s)) return o;
    const card = guessParentCard(o, s);
    if (!card) return o;
    attached.push({ loan: o.name, card: card.name });
    return { ...o, link: { ...o.link!, parentObligationId: card.id, creditLineId: card.creditLineId } };
  });
  const creditLines = s.creditLines.map((l) => {
    const owners = obligations.filter((o): o is StatementBased => isCard(o) && o.creditLineId === l.id);
    return owners.length === 1 ? { ...l, name: creditLineNameFor(owners[0].name) } : l;
  });
  return { state: { ...s, obligations, creditLines }, attached };
}
