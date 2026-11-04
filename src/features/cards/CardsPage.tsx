import { UsageBar } from '../../components/charts';
import { Empty } from '../../components/ui';
import { creditLineUsage } from '../../domain/creditLine';
import type { Obligation } from '../../domain/types';
import { useEngine, useFmt, useProfile } from '../../state/hooks';
import { useNav } from '../../state/nav';
import { StatementsPanel } from './StatementsPanel';

function partLabel(kind: 'card' | 'linked', ob?: Obligation) {
  if (kind === 'card') return 'dư nợ thẻ';
  return ob?.kind === 'installment_loan' && ob.link?.billedIntoStatement ? 'gốc chưa lên sao kê' : 'gốc còn lại';
}

export function CardsPage() {
  const state = useProfile();
  const engine = useEngine();
  const fmt = useFmt();
  const go = useNav((n) => n.go);
  const warn = state.profile.settings.utilizationWarning;

  if (state.creditLines.length === 0) {
    return <Empty>Chưa có thẻ hoặc hạn mức nào. <button className="link" onClick={() => go('obligations')}>Thêm thẻ tín dụng →</button></Empty>;
  }

  return (
    <div className="stack">
      {state.creditLines.map((line) => {
        const u = creditLineUsage(engine, line.id, state.viewMonth)!;
        const cards = engine.statementBased().filter((c) => c.creditLineId === line.id);
        const cardPart = u.breakdown.filter((b) => b.kind === 'card').reduce((s, b) => s + b.amount, 0);
        const linkedPart = u.breakdown.filter((b) => b.kind === 'linked').reduce((s, b) => s + b.amount, 0);
        return (
          <section key={line.id} className="panel">
            <div className="panel-head">
              <h2>{line.name}</h2>
              <span className={u.available < 0 ? 'bad-text' : u.utilization > warn ? 'warn-text' : 'muted'}>
                Đã dùng {fmt.rate(u.utilization, 1)} {u.utilization > warn && `(trên ngưỡng ${fmt.rate(warn, 0)})`}
              </span>
            </div>
            <div className="big-numbers">
              <div><span className="tile-label">Hạn mức</span><b>{fmt.money(u.limit)}</b></div>
              <div><span className="tile-label">Khả dụng</span><b>{fmt.money(u.available)}</b></div>
            </div>
            <UsageBar
              limit={u.limit}
              format={fmt.money}
              parts={[
                { key: 'card', label: 'Dư nợ thẻ', value: cardPart, color: 'var(--series-1)' },
                { key: 'linked', label: 'Khoản vay dùng chung hạn mức', value: linkedPart, color: 'var(--series-2)' },
              ]}
            />
            <table>
              <tbody>
                {u.breakdown.map((b) => (
                  <tr key={b.obligationId}>
                    <td>
                      <button className="link" onClick={() => go('obligation', b.obligationId)}>{b.label}</button>
                      <span className="muted"> · {partLabel(b.kind, engine.obligation(b.obligationId))}</span>
                    </td>
                    <td className="r">{fmt.money(b.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cards.map((c) => (
              <StatementsPanel key={c.id} ob={c} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
