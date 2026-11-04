import { useState } from 'react';
import { Select } from '../../components/inputs';
import { Empty } from '../../components/ui';
import { describeDueRule, describeInterestModel } from '../../domain/rules';
import type { Obligation } from '../../domain/types';
import { useEngine, useFmt, useProfile, useSummary } from '../../state/hooks';
import { useNav } from '../../state/nav';
import { ObligationForm } from './ObligationForm';

export const KIND_LABEL: Record<Obligation['kind'], string> = {
  credit_card: 'Thẻ tín dụng',
  installment_loan: 'Vay trả góp',
  revolving: 'Hạn mức',
  custom: 'Tự định nghĩa',
};

const STATUS_LABEL = { active: 'Đang theo dõi', paused: 'Tạm dừng', closed: 'Đã đóng' };

export function ObligationList() {
  const state = useProfile();
  const engine = useEngine();
  const summary = useSummary();
  const fmt = useFmt();
  const go = useNav((n) => n.go);
  const [adding, setAdding] = useState(false);
  const [inst, setInst] = useState('all');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('open');

  const list = state.obligations.filter(
    (o) =>
      (inst === 'all' || o.institutionId === inst) &&
      (kind === 'all' || o.kind === kind) &&
      (status === 'all' || (status === 'open' ? o.status !== 'closed' : o.status === status)),
  );

  const debtOf = (o: Obligation) => {
    if (o.kind === 'installment_loan') return engine.loanDebt(o);
    return summary.rows.find((r) => r.obligationId === o.id)?.debtRemaining;
  };

  const ruleOf = (o: Obligation) => {
    try {
      if (o.kind === 'installment_loan') return `${describeInterestModel(o.interestModel)} · ${describeDueRule(o.dueRule)}`;
      if (o.kind === 'credit_card' || o.kind === 'revolving') return describeDueRule(o.dueRule);
      return `${o.schedule.length} lần trả`;
    } catch {
      return '';
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Khoản nợ</h2>
        <button className="primary" onClick={() => setAdding(true)}>+ Thêm khoản nợ</button>
      </div>
      <div className="toolbar">
        <Select
          value={inst}
          onChange={setInst}
          options={[{ value: 'all', label: 'Mọi tổ chức' }, ...state.institutions.map((i) => ({ value: i.id, label: i.name }))]}
        />
        <Select
          value={kind}
          onChange={setKind}
          options={[{ value: 'all', label: 'Mọi loại' }, ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))]}
        />
        <Select
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: 'Chưa đóng' },
            { value: 'active', label: 'Đang theo dõi' },
            { value: 'paused', label: 'Tạm dừng' },
            { value: 'closed', label: 'Đã đóng' },
            { value: 'all', label: 'Tất cả' },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <Empty>Không có khoản nào khớp bộ lọc.</Empty>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Tên</th>
                <th>Tổ chức</th>
                <th>Loại</th>
                <th>Tiến độ</th>
                <th className="r">Dư nợ</th>
                <th>Quy tắc</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const led = o.kind === 'installment_loan' ? engine.ledger(o) : undefined;
                return (
                  <tr key={o.id} className="clickable" onClick={() => go('obligation', o.id)}>
                    <td><button className="link">{o.name}</button></td>
                    <td>{engine.institution(o.institutionId)?.name}</td>
                    <td>{KIND_LABEL[o.kind]}</td>
                    <td>
                      {led && o.kind === 'installment_loan' && (
                        <span className="progress">
                          <span style={{ width: `${(led.periodsPaid / o.periods) * 100}%` }} />
                          <em>{led.periodsPaid}/{o.periods}</em>
                        </span>
                      )}
                    </td>
                    <td className="r">{o.status === 'closed' ? '—' : fmt.money(debtOf(o))}</td>
                    <td className="muted small-text">{ruleOf(o)}</td>
                    <td>{STATUS_LABEL[o.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <ObligationForm
          onClose={(id) => {
            setAdding(false);
            if (id) go('obligation', id);
          }}
        />
      )}
    </section>
  );
}
