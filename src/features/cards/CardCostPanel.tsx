import { cardCost, type PayoffEstimate, type Range } from '../../domain/cardCost';
import type { CreditCardObligation } from '../../domain/types';
import { useEngine, useFmt, useProfile } from '../../state/hooks';
import { useNav } from '../../state/nav';

function duration(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} năm`, m && `${m} tháng`].filter(Boolean).join(' ') || '0 tháng';
}

/** Mục tham khảo: trả đủ / trả tối thiểu / trả trễ thì tốn thêm bao nhiêu. */
export function CardCostPanel({ card }: { card: CreditCardObligation }) {
  const engine = useEngine();
  const fmt = useFmt();
  const month = useProfile().viewMonth;
  const go = useNav((n) => n.go);
  const c = cardCost(engine, card, month);
  if (!c) return null;

  const range = (r: Range) => (r.min === r.max ? fmt.money(r.min) : `${fmt.money(r.min)} – ${fmt.money(r.max)}`);
  const rateText = (r: Range) => (r.min === r.max ? fmt.rate(r.min, 2) : `${fmt.rate(r.min, 2)} – ${fmt.rate(r.max, 2)}`);
  const plus = (r: Range, fee = 0) => range({ min: r.min + fee, max: r.max + fee });
  const payoffText = (p: PayoffEstimate) =>
    p.capped ? 'không bao giờ hết (lãi cao hơn mức tối thiểu)' : `${duration(p.months)}, tổng lãi ${fmt.money(p.totalInterest)}`;
  const edit = (
    <button className="link" onClick={() => go('obligation', card.id)}>
      nhập trong trang thẻ →
    </button>
  );
  const pct = card.minimumPayment?.percentOfStatement ?? 0.05;

  return (
    <section className="panel card-cost" aria-label={`Chi phí nếu không trả đủ ${card.name}`}>
      <div className="panel-head">
        <h2>Nếu không trả đủ — {card.name}</h2>
        <span className="muted small-text">Tham khảo</span>
      </div>
      <p className="muted small-text">
        Sao kê {fmt.short(c.statement.statementDate)}: dư nợ {fmt.money(c.statement.statementBalance)}
        {c.installments > 0 && <> (gồm kỳ trả góp {fmt.money(c.installments)})</>} · tối thiểu {fmt.money(c.minimum)}
        {c.minimumEstimated && ` (ước tính ${fmt.rate(pct, 0)})`} · hạn {fmt.date(c.statement.dueDate)}
        {c.monthlyRate && <> · lãi {rateText(c.monthlyRate)}/tháng</>}
      </p>
      {!c.interest ? (
        <p className="muted">Chưa nhập lãi suất thẻ — {edit}</p>
      ) : (
        <table className="cards-mobile">
          <thead>
            <tr><th>Cách trả</th><th className="r">Trả trước hạn</th><th className="r">Lãi</th><th className="r">Phí chậm trả</th><th className="r">Tốn thêm</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Trả đủ dư nợ sao kê</td>
              <td className="r">{fmt.money(c.statement.statementBalance)}</td>
              <td className="r">{fmt.money(0)}</td>
              <td className="r">{fmt.money(0)}</td>
              <td className="r good-text">{fmt.money(0)}</td>
            </tr>
            <tr>
              <td>Chỉ trả tối thiểu, đúng hạn</td>
              <td className="r">{fmt.money(c.minimum)}</td>
              <td className="r">{range(c.interest)}</td>
              <td className="r">{fmt.money(0)}</td>
              <td className="r warn-text">{range(c.interest)}</td>
            </tr>
            <tr>
              <td>Trả trễ hạn (chưa đủ tối thiểu)</td>
              <td className="r">{fmt.money(0)}</td>
              <td className="r">{range(c.interest)}</td>
              <td className="r">{c.lateFee === undefined ? <span className="muted">chưa nhập</span> : fmt.money(c.lateFee)}</td>
              <td className="r bad-text">
                {plus(c.interest, c.lateFee)}
                {c.lateFee === undefined && ' + phí'}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {c.payoff && (
        <p className="payoff">
          Nếu kỳ nào cũng chỉ trả tối thiểu ({fmt.rate(pct, 0)}
          {card.minimumPayment?.floor ? `, ít nhất ${fmt.money(card.minimumPayment.floor)}` : ''}) và không tiêu thêm, phần chi tiêu{' '}
          {fmt.money(c.interestBase)} mất{' '}
          <b>
            {c.payoff.atMin.months === c.payoff.atMax.months && c.payoff.atMin.totalInterest === c.payoff.atMax.totalInterest
              ? payoffText(c.payoff.atMin)
              : `${payoffText(c.payoff.atMax)} (lãi cao) — ${payoffText(c.payoff.atMin)} (lãi thấp)`}
          </b>
          .
        </p>
      )}
      <ul className="muted small-text notes">
        <li>
          Lãi ước tính = phần chi tiêu trong sao kê × lãi tháng (kỳ trả góp đã nằm trong số tối thiểu nên không tính). Ngân hàng tính lãi theo
          ngày, từ ngày giao dịch tới ngày trả đủ, nên số thật có thể chênh.
        </li>
        <li>Trả thiếu tối thiểu từ 10 ngày: khoản nợ bị chuyển nhóm quá hạn trên CIC, ảnh hưởng vay vốn sau này.</li>
        {c.lateFee === undefined && <li>Chưa nhập phí chậm thanh toán — {edit}</li>}
      </ul>
    </section>
  );
}
