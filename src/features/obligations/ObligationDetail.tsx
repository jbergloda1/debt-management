import { useState } from 'react';
import { Empty, Modal, StatusBadge, Tile } from '../../components/ui';
import { creditLineUsage } from '../../domain/creditLine';
import { dueItemsForMonth } from '../../domain/dueItems';
import { newId } from '../../domain/defaults';
import { expectedPaidAt, loanItemKey } from '../../domain/ledger';
import { loanMetrics } from '../../domain/metrics';
import { describeDueRule, describeInterestModel } from '../../domain/rules';
import type { DueItem, InstallmentLoanObligation, Obligation } from '../../domain/types';
import { useEngine, useFmt, useProfile, useUpdate } from '../../state/hooks';
import { useNav } from '../../state/nav';
import { useStore } from '../../state/store';
import { StatementsPanel } from '../cards/StatementsPanel';
import { PaymentModal } from '../payments/PaymentModal';
import { ObligationForm, ScheduleTable } from './ObligationForm';
import { KIND_LABEL } from './ObligationList';

export function ObligationDetail({ id }: { id: string }) {
  const state = useProfile();
  const engine = useEngine();
  const fmt = useFmt();
  const update = useUpdate();
  const go = useNav((n) => n.go);
  const today = useStore((s) => s.today);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState<DueItem | null>(null);
  const [settling, setSettling] = useState(false);
  const ob = state.obligations.find((o) => o.id === id);
  if (!ob) return <Empty>Không tìm thấy khoản nợ. <button className="link" onClick={() => go('obligations')}>← Danh sách</button></Empty>;

  const inst = engine.institution(ob.institutionId);
  const payments = engine.payments(ob.id).slice().sort((a, b) => b.date.localeCompare(a.date));
  const items = dueItemsForMonth(engine, state.viewMonth).filter((i) => i.obligationId === ob.id && !i.includedIn);

  const remove = () => {
    if (!confirm(`Xoá "${ob.name}" cùng toàn bộ sao kê và lịch sử thanh toán của khoản này?`)) return;
    update((s) => ({
      ...s,
      obligations: s.obligations.filter((o) => o.id !== ob.id),
      payments: s.payments.filter((p) => p.obligationId !== ob.id),
      statements: s.statements.filter((x) => x.obligationId !== ob.id),
    }));
    go('obligations');
  };

  return (
    <div className="stack">
      <div className="panel-head">
        <div>
          <button className="link" onClick={() => go('obligations')}>← Khoản nợ</button>
          <h1>{ob.name}</h1>
          <p className="muted">
            {inst?.name} · {KIND_LABEL[ob.kind]}
            {ob.kind === 'credit_card' && ob.last4 && ` · •••• ${ob.last4}`}
            {ob.status !== 'active' && ` · ${ob.status === 'closed' ? 'Đã đóng' : 'Tạm dừng'}`}
          </p>
          {ob.note && <p className="note">{ob.note}</p>}
        </div>
        <div className="toolbar">
          <button onClick={() => setEditing(true)}>Sửa</button>
          {ob.kind === 'installment_loan' && ob.status !== 'closed' && <button onClick={() => setSettling(true)}>Tất toán</button>}
          <button className="danger" onClick={remove}>Xoá</button>
        </div>
      </div>

      {items.length > 0 && (
        <section className="panel">
          <h2>Tháng đang xem</h2>
          <table className="cards-mobile">
            <tbody>
              {items.map((it) => (
                <tr key={it.key}>
                  <td>{it.label}</td>
                  <td>{fmt.date(it.dueDate)}</td>
                  <td className="r">{fmt.money(it.amount)}</td>
                  <td className="r">{it.paidAmount ? `đã trả ${fmt.money(it.paidAmount)}` : ''}</td>
                  <td><StatusBadge state={it.state} /></td>
                  <td>{it.state !== 'paid' && <button className="small" onClick={() => setPaying(it)}>Ghi nhận thanh toán</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {ob.kind === 'installment_loan' && <LoanSection ob={ob} today={today} />}
      {(ob.kind === 'credit_card' || ob.kind === 'revolving') && (
        <>
          <CardSection ob={ob} />
          <StatementsPanel ob={ob} />
        </>
      )}
      {ob.kind === 'custom' && (
        <section className="panel">
          <h2>Lịch trả</h2>
          <table className="cards-mobile">
            <tbody>
              {ob.schedule.map((e, i) => {
                const key = loanItemKey(ob.id, i + 1);
                const paid = payments.filter((p) => p.dueItemKey === key).reduce((s, p) => s + p.amount, 0);
                return (
                  <tr key={i} className={paid >= e.amount ? 'done' : undefined}>
                    <td>{fmt.date(e.dueDate)}</td>
                    <td>{e.note}</td>
                    <td className="r">{fmt.money(e.amount)}</td>
                    <td className="r">{paid ? fmt.money(paid) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel">
        <h2>Lịch sử thanh toán</h2>
        {payments.length === 0 ? (
          <p className="muted">Chưa ghi nhận thanh toán nào.</p>
        ) : (
          <table className="cards-mobile">
            <thead>
              <tr><th>Ngày</th><th>Cho kỳ</th><th className="r">Số tiền</th><th>Hình thức</th><th>Ghi chú</th><th></th></tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmt.date(p.date)}</td>
                  <td className="muted">{keyLabel(p.dueItemKey, ob)}</td>
                  <td className="r">{fmt.money(p.amount)}</td>
                  <td>{p.method}</td>
                  <td>{p.note}</td>
                  <td>
                    <button
                      className="ghost small"
                      onClick={() => confirm('Xoá lần thanh toán này?') && update((s) => ({ ...s, payments: s.payments.filter((x) => x.id !== p.id) }))}
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editing && <ObligationForm initial={ob} onClose={() => setEditing(false)} />}
      {paying && <PaymentModal item={paying} title={ob.name} onClose={() => setPaying(null)} />}
      {settling && ob.kind === 'installment_loan' && <SettleModal ob={ob} onClose={() => setSettling(false)} />}
    </div>
  );

  function keyLabel(key: string | undefined, o: Obligation) {
    if (!key) return 'Không gắn kỳ (phân bổ FIFO)';
    const rest = key.slice(o.id.length + 1);
    if (rest.startsWith('fee:')) return 'Phí';
    if (/^\d+$/.test(rest)) return `Kỳ ${rest}`;
    const st = state.statements.find((s) => s.id === rest);
    return st ? `Sao kê ${fmt.short(st.statementDate)}` : rest;
  }
}

function LoanSection({ ob, today }: { ob: InstallmentLoanObligation; today: string }) {
  const engine = useEngine();
  const state = useProfile();
  const fmt = useFmt();
  const inst = engine.institution(ob.institutionId);
  const led = engine.ledger(ob);
  const rows = engine.schedule(ob);
  const m = loanMetrics(ob, inst, state.profile.settings);
  const expected = ob.opening ? expectedPaidAt(rows, ob.opening.asOf) : undefined;
  const parent = ob.link?.parentObligationId ? engine.obligation(ob.link.parentObligationId) : undefined;

  return (
    <>
      <section className="tiles">
        <Tile label="Tiến độ" value={`${led.periodsPaid}/${ob.periods} kỳ`} sub={led.nextUnpaid ? `Kỳ tới ${fmt.date(led.nextUnpaid.dueDate)}: ${fmt.money(led.nextUnpaid.total)}` : 'Đã trả xong'} />
        <Tile label="Gốc còn lại" value={fmt.money(led.principalRemaining)} sub={`Còn phải trả ${fmt.money(led.remainingPayments)}`} />
        <Tile label="Lãi danh nghĩa / thực tế" value={`${fmt.rate(m.nominalAPR)} / ${fmt.rate(m.effectiveAPR)}`} sub={`EAR ${fmt.rate(m.EAR)}`} tone={m.effectiveAPR > state.profile.settings.highAprThreshold ? 'warn' : undefined} />
        <Tile label="Tổng chi phí vay" value={fmt.money(m.totalCost)} sub={`Thực nhận ${fmt.money(m.netDisbursed)} · trả ${fmt.money(m.totalPaid)}`} />
      </section>
      <section className="panel">
        <h2>Thông tin</h2>
        <dl className="kv">
          <dt>Số tiền vay</dt><dd>{fmt.money(ob.principal)}</dd>
          <dt>Giải ngân</dt><dd>{fmt.date(ob.startDate)}</dd>
          <dt>Cách tính lãi</dt><dd>{describeInterestModel(ob.interestModel)}</dd>
          <dt>Ngày trả</dt><dd>{describeDueRule(ob.dueRule)}{ob.dueDateEstimated && ' (tạm tính)'}</dd>
          {parent && (
            <>
              <dt>Gắn với</dt>
              <dd>
                {parent.name}
                {ob.link?.sharesCreditLimit && ' · dùng chung hạn mức'}
                {ob.link?.billedIntoStatement && ' · nằm trong sao kê'}
              </dd>
            </>
          )}
          {ob.opening && (
            <>
              <dt>Bắt đầu theo dõi</dt>
              <dd>
                {fmt.date(ob.opening.asOf)} — đã trả {ob.opening.periodsPaid} kỳ
                {expected !== ob.opening.periodsPaid && <span className="warn-text"> · Lệch: theo lịch là {expected} kỳ</span>}
              </dd>
            </>
          )}
        </dl>
      </section>
      <section className="panel">
        <h2>Bảng kỳ hạn</h2>
        <ScheduleTable rows={rows} paid={(n) => led.rows[n - 1]} />
        <p className="muted small-text">Hôm nay {fmt.date(today)}.</p>
      </section>
    </>
  );
}

function CardSection({ ob }: { ob: Extract<Obligation, { kind: 'credit_card' | 'revolving' }> }) {
  const engine = useEngine();
  const state = useProfile();
  const fmt = useFmt();
  const u = creditLineUsage(engine, ob.creditLineId, state.viewMonth);
  const billed = engine.billedLoans(ob.id);
  return (
    <section className="tiles">
      <Tile label="Dư nợ thẻ hiện tại" value={fmt.money(engine.cardBalance(ob, state.viewMonth))} />
      {u && <Tile label="Hạn mức khả dụng" value={fmt.money(u.available)} sub={`${fmt.rate(u.utilization, 0)} của ${fmt.money(u.limit)}`} tone={u.available < 0 ? 'bad' : u.utilization > state.profile.settings.utilizationWarning ? 'warn' : undefined} />}
      <Tile label="Cách trả" value={policyLabel(engine.policyOf(ob))} sub={describeDueRule(ob.dueRule)} />
      {billed.length > 0 && <Tile label="Trả góp trong sao kê" value={`${billed.length} khoản`} sub={billed.map((b) => b.name).join(', ')} />}
    </section>
  );
}

const policyLabel = (p: ReturnType<ReturnType<typeof useEngine>['policyOf']>) =>
  typeof p === 'object'
    ? 'Số tiền cố định'
    : { current_balance: 'Trả hết dư nợ hiện tại', statement_balance: 'Trả dư nợ sao kê', minimum: 'Trả tối thiểu' }[p];

/** Tất toán: ghi nhận một khoản trả toàn bộ phần còn lại rồi đóng khoản vay. */
function SettleModal({ ob, onClose }: { ob: InstallmentLoanObligation; onClose: () => void }) {
  const engine = useEngine();
  const update = useUpdate();
  const fmt = useFmt();
  const today = useStore((s) => s.today);
  const led = engine.ledger(ob);
  const settle = (amount: number) => {
    update((s) => ({
      ...s,
      payments: [...s.payments, { id: newId('pay'), obligationId: ob.id, date: today, amount, note: 'Tất toán' }],
      obligations: s.obligations.map((o) => (o.id === ob.id ? { ...o, status: 'closed' as const } : o)),
    }));
    onClose();
  };
  return (
    <Modal title={`Tất toán ${ob.name}`} onClose={onClose}>
      <p>
        Gốc còn lại <b>{fmt.money(led.principalRemaining)}</b> · tổng các kỳ còn lại <b>{fmt.money(led.remainingPayments)}</b>.
      </p>
      <p className="muted">
        Số tiền tất toán thực tế (gốc + lãi đến ngày + phí phạt trả trước) tuỳ hợp đồng — hãy hỏi tổ chức cho vay. App ghi nhận khoản
        thanh toán và đóng khoản vay.
      </p>
      <div className="toolbar">
        <button onClick={() => settle(led.principalRemaining)}>Ghi nhận {fmt.money(led.principalRemaining)} và đóng</button>
        <button
          onClick={() => {
            const v = prompt('Số tiền tất toán thực tế (chỉ chữ số):');
            const n = Number(v?.replace(/\D/g, ''));
            if (n > 0) settle(n);
          }}
        >
          Nhập số khác…
        </button>
      </div>
    </Modal>
  );
}
