import { useMemo } from 'react';
import type { Range } from '../../domain/cardCost';
import { applyPlan, planApplied, planForSummary } from '../../domain/paymentPlan';
import { useEngine, useFmt, useSummary, useUpdate } from '../../state/hooks';

/** Gợi ý chia tiền khi không đủ trả mọi khoản tháng này (hoặc thiếu tạm thời trước ngày tiền về). */
export function PaymentPlanPanel() {
  const engine = useEngine();
  const summary = useSummary();
  const update = useUpdate();
  const fmt = useFmt();
  const plan = useMemo(() => planForSummary(engine, summary), [engine, summary]);
  const applied = planApplied(plan, summary.items);
  const { verdict } = summary.cash;
  if (!applied && verdict !== 'short' && verdict !== 'short_temporarily') return null;

  const range = (r: Range) => (r.min === r.max ? fmt.money(r.min) : `${fmt.money(r.min)} – ${fmt.money(r.max)}`);
  const late = plan.lines.filter((l) => l.late);
  const hasLater = plan.lines.some((l) => l.later > 0);
  const use = () => update((s) => ({ ...s, plannedAmounts: applyPlan(s.plannedAmounts, plan, summary.items) }));
  const drop = () =>
    update((s) => {
      const plannedAmounts = { ...s.plannedAmounts };
      for (const l of plan.lines) delete plannedAmounts[l.key];
      return { ...s, plannedAmounts };
    });

  return (
    <section className="panel payment-plan" aria-label="Gợi ý trả khi thiếu tiền">
      <div className="panel-head">
        <h2>Gợi ý trả khi thiếu tiền</h2>
        <span className="muted small-text">Tham khảo</span>
      </div>
      <p className="muted small-text">
        Có {fmt.money(Math.max(0, plan.budget))} cho trả nợ tháng này · cần {fmt.money(plan.needFull)} để trả đủ · phần bắt buộc{' '}
        {fmt.money(plan.needMinimum)}. Ưu tiên: kỳ trả góp và tối thiểu thẻ đúng hạn, rồi trả hẳn sao kê thẻ có lợi nhất, còn dư trả thêm thẻ lãi
        cao.
      </p>
      {late.length > 0 && (
        <p className="alert error">
          Không đủ tiền trước hạn cho {late.length} khoản — sẽ bị phí phạt. Trả bù càng sớm càng tốt: trễ từ 10 ngày bị chuyển nhóm nợ trên CIC.
        </p>
      )}
      <table className="cards-mobile">
        <thead>
          <tr>
            <th>Khoản</th>
            <th className="r">Trả trước hạn</th>
            {hasLater && <th className="r">Trả sau khi có tiền</th>}
            <th className="r">Bắt buộc</th>
            <th className="r">Tốn thêm</th>
          </tr>
        </thead>
        <tbody>
          {plan.lines.map((l) => (
            <tr key={l.key} className={l.late ? 'short' : undefined}>
              <td>
                {l.label} <span className="muted small-text">· hạn {fmt.short(l.dueDate)}</span>
                {l.late && <> <span className="badge red">trễ</span></>}
              </td>
              <td className="r">{fmt.money(l.onTime)}{l.onTime >= l.full && <span className="muted small-text"> (đủ)</span>}</td>
              {hasLater && <td className="r">{l.later ? fmt.money(l.later) : ''}</td>}
              <td className="r">{fmt.money(l.minimum)}</td>
              <td className={`r ${l.late ? 'bad-text' : l.cost.max > 0 ? 'warn-text' : ''}`}>
                {range(l.cost)}
                {l.feeUnknown && ' + phí'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="plan-foot">
        <span>
          Tốn thêm khoảng <b>{range(plan.totalCost)}</b>
          {late.some((l) => l.feeUnknown) && <span className="muted"> + phí phạt chưa nhập</span>}
        </span>
        {applied ? (
          <span className="plan-applied">
            <span className="good-text">Đang dùng kế hoạch này</span>
            <button className="ghost small" onClick={drop}>Bỏ kế hoạch</button>
          </span>
        ) : (
          <button className="primary" onClick={use}>Dùng kế hoạch này</button>
        )}
      </div>
      {hasLater && (
        <p className="muted small-text">
          "Trả sau khi có tiền": số tiền chỉ có sau ngày hạn (vd. lương về) — trả ngay khi nhận. Với thẻ đã trả tối thiểu, trả thêm giúp giảm lãi
          kỳ sau; dùng kế hoạch thì số này để lại ở "còn lại" của tháng.
        </p>
      )}
    </section>
  );
}
