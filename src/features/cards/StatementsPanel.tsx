import { useState } from 'react';
import { DateInput, Field, MoneyInput } from '../../components/inputs';
import { Modal, StatusBadge } from '../../components/ui';
import { addMonthsYM, monthOf, setDay } from '../../domain/dates';
import { newId } from '../../domain/defaults';
import { itemState } from '../../domain/dueItems';
import { generateDueDates } from '../../domain/rules';
import type { Statement, StatementBased } from '../../domain/types';
import { useEngine, useFmt, useProfile, useUpdate } from '../../state/hooks';
import { useStore } from '../../state/store';

export function StatementsPanel({ ob }: { ob: StatementBased }) {
  const engine = useEngine();
  const state = useProfile();
  const update = useUpdate();
  const fmt = useFmt();
  const today = useStore((s) => s.today);
  const [editing, setEditing] = useState<Statement | null>(null);
  const list = engine.statements(ob.id).slice().reverse();

  const suggest = (): Statement => {
    const latest = engine.statements(ob.id).at(-1);
    const statementDay = ob.kind === 'credit_card' ? ob.statementDay : 1;
    const statementDate = latest
      ? setDay(addMonthsYM(monthOf(latest.statementDate), 1), statementDay)
      : setDay(Number(today.slice(8)) >= statementDay ? monthOf(today) : addMonthsYM(monthOf(today), -1), statementDay);
    const dueDate = generateDueDates(ob.dueRule, statementDate, 1)[0] ?? statementDate;
    return { id: newId('st'), obligationId: ob.id, statementDate, dueDate, statementBalance: 0, currentBalance: 0, capturedAt: today };
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Sao kê</h2>
        <button className="small" onClick={() => setEditing(suggest())}>+ Nhập sao kê mới</button>
      </div>
      {list.length === 0 ? (
        <p className="muted">Chưa có sao kê — nhập sao kê để app biết số phải trả kỳ này.</p>
      ) : (
        <table className="cards-mobile">
          <thead>
            <tr>
              <th>Ngày sao kê</th>
              <th>Đến hạn</th>
              <th className="r">Dư nợ sao kê</th>
              <th className="r">Dư nợ hiện tại</th>
              <th className="r">Phải trả (theo cách trả)</th>
              <th className="r">Đã trả</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((st) => {
              const amount = engine.statementAmount(ob, st);
              const paid = engine.statementPaid(ob, st);
              return (
                <tr key={st.id}>
                  <td>{fmt.date(st.statementDate)}</td>
                  <td>{fmt.date(st.dueDate)}</td>
                  <td className="r">{fmt.money(st.statementBalance)}</td>
                  <td className="r">{fmt.money(st.currentBalance)}</td>
                  <td className="r">{fmt.money(amount)}</td>
                  <td className="r">{paid ? fmt.money(paid) : ''}</td>
                  <td>
                    <StatusBadge state={itemState(st.dueDate, amount, paid, today, state.profile.settings.dueSoonThresholdDays, monthOf(st.dueDate))} />
                  </td>
                  <td>
                    <button className="ghost small" onClick={() => setEditing(st)}>Sửa</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && (
        <StatementModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(st) =>
            update((s) => ({ ...s, statements: [...s.statements.filter((x) => x.id !== st.id), st] }))
          }
          onDelete={
            state.statements.some((x) => x.id === editing.id)
              ? () => update((s) => ({ ...s, statements: s.statements.filter((x) => x.id !== editing.id) }))
              : undefined
          }
        />
      )}
    </section>
  );
}

function StatementModal(props: {
  initial: Statement;
  onClose: () => void;
  onSave: (s: Statement) => void;
  onDelete?: () => void;
}) {
  const [st, setSt] = useState(props.initial);
  const set = (p: Partial<Statement>) => setSt({ ...st, ...p });
  const valid = st.statementDate && st.dueDate && st.dueDate >= st.statementDate;
  return (
    <Modal
      title="Sao kê"
      onClose={props.onClose}
      footer={
        <>
          {props.onDelete && (
            <button className="danger" onClick={() => { if (confirm('Xoá sao kê này?')) { props.onDelete!(); props.onClose(); } }}>
              Xoá
            </button>
          )}
          <span className="spacer" />
          <button onClick={props.onClose}>Huỷ</button>
          <button className="primary" disabled={!valid} onClick={() => { props.onSave(st); props.onClose(); }}>
            Lưu
          </button>
        </>
      }
    >
      <div className="form">
        <Field label="Ngày sao kê"><DateInput value={st.statementDate} onChange={(v) => v && set({ statementDate: v })} /></Field>
        <Field label="Ngày đến hạn"><DateInput value={st.dueDate} onChange={(v) => v && set({ dueDate: v })} /></Field>
        <Field label="Dư nợ sao kê"><MoneyInput value={st.statementBalance} onChange={(v) => set({ statementBalance: v ?? 0 })} /></Field>
        <Field label="Dư nợ hiện tại" hint="Gồm cả chi tiêu sau ngày sao kê"><MoneyInput value={st.currentBalance} onChange={(v) => set({ currentBalance: v ?? 0 })} /></Field>
        <Field label="Thanh toán tối thiểu (nếu ngân hàng ghi)"><MoneyInput value={st.minimumDue} onChange={(minimumDue) => set({ minimumDue })} /></Field>
        <Field label="Ngày nhập số dư" hint="Các khoản trả từ ngày này được trừ vào dư nợ hiện tại">
          <DateInput value={st.capturedAt} onChange={(v) => v && set({ capturedAt: v })} />
        </Field>
      </div>
    </Modal>
  );
}
