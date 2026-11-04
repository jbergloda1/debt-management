import { useMemo, useState } from 'react';
import { LineChart, StackedColumns } from '../../components/charts';
import { Check, Field, IntInput, MoneyInput, Select, TextInput } from '../../components/inputs';
import { Empty } from '../../components/ui';
import { incomeOccurrences } from '../../domain/cashflow';
import { addMonthsYM, formatYM } from '../../domain/dates';
import { newId } from '../../domain/defaults';
import { minorUnitDigits, sumBy } from '../../domain/money';
import { project } from '../../domain/projection';
import type { Scenario } from '../../domain/types';
import { useEngine, useFmt, useProfile, useUpdate } from '../../state/hooks';

const SERIES = [
  { key: 'installments', label: 'Trả góp & khoản vay', color: 'var(--series-1)' },
  { key: 'cards', label: 'Thẻ (chi tiêu + trả góp trong sao kê)', color: 'var(--series-2)' },
  { key: 'extra', label: 'Trả thêm', color: 'var(--series-3)' },
];

export function Projection() {
  const state = useProfile();
  const engine = useEngine();
  const update = useUpdate();
  const fmt = useFmt();
  const [scnId, setScnId] = useState(state.scenarios[0]?.id ?? '');
  const [fromCurrent, setFromCurrent] = useState(false);
  const scn = state.scenarios.find((s) => s.id === scnId) ?? state.scenarios[0];
  const from = fromCurrent ? state.viewMonth : addMonthsYM(state.viewMonth, 1);
  const result = useMemo(() => (scn ? project(engine, scn, from) : null), [engine, scn, from]);

  const compact = useMemo(() => new Intl.NumberFormat(state.profile.locale, { notation: 'compact', maximumFractionDigits: 1 }), [state.profile.locale]);

  const setScn = (p: Partial<Scenario>) =>
    update((s) => ({ ...s, scenarios: s.scenarios.map((x) => (x.id === scn!.id ? { ...x, ...p } : x)) }));

  const addScenario = (copy?: Scenario) => {
    const n: Scenario = copy
      ? { ...structuredClone(copy), id: newId('scn'), name: `${copy.name} (bản sao)` }
      : { id: newId('scn'), name: 'Kịch bản mới', horizonMonths: 12, assumeAllPaidOnTime: true, cardMonthlySpending: {} };
    update((s) => ({ ...s, scenarios: [...s.scenarios, n] }));
    setScnId(n.id);
  };

  if (!scn || !result) {
    return <Empty><button onClick={() => addScenario()}>+ Tạo kịch bản dự phóng</button></Empty>;
  }

  const cards = engine.statementBased();
  const minor = (v: number) => v / 10 ** minorUnitDigits(state.profile.currency);
  const labels = result.months.map((m) => formatYM(m.month, state.profile.locale));
  const values = result.months.map((m) => ({ installments: m.installments, cards: m.cards, extra: m.extra }));
  const series = SERIES.filter((s) => values.some((v) => v[s.key as keyof typeof v] > 0));

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Kịch bản</h2>
          <div className="toolbar">
            <Select value={scn.id} onChange={setScnId} options={state.scenarios.map((s) => ({ value: s.id, label: s.name }))} />
            <button className="small" onClick={() => addScenario()}>+ Mới</button>
            <button className="small" onClick={() => addScenario(scn)}>Nhân bản</button>
            {state.scenarios.length > 1 && (
              <button
                className="small ghost"
                onClick={() => {
                  if (!confirm(`Xoá kịch bản "${scn.name}"?`)) return;
                  update((s) => ({ ...s, scenarios: s.scenarios.filter((x) => x.id !== scn.id) }));
                  setScnId(state.scenarios.find((x) => x.id !== scn.id)!.id);
                }}
              >
                Xoá
              </button>
            )}
          </div>
        </div>
        <div className="form">
          <Field label="Tên"><TextInput value={scn.name} onChange={(name) => setScn({ name })} /></Field>
          <Field label="Số tháng"><IntInput min={1} max={120} value={scn.horizonMonths} onChange={(horizonMonths) => setScn({ horizonMonths: Math.max(1, Math.min(120, horizonMonths)) })} /></Field>
          {cards.map((c) => (
            <Field key={c.id} label={`Chi tiêu mới mỗi tháng · ${c.name}`}>
              <MoneyInput
                value={scn.cardMonthlySpending[c.id]}
                onChange={(v) => {
                  const cardMonthlySpending = { ...scn.cardMonthlySpending };
                  if (v) cardMonthlySpending[c.id] = v;
                  else delete cardMonthlySpending[c.id];
                  setScn({ cardMonthlySpending });
                }}
              />
            </Field>
          ))}
        </div>
        <div className="toolbar">
          <Check checked={scn.assumeAllPaidOnTime} onChange={(assumeAllPaidOnTime) => setScn({ assumeAllPaidOnTime })}>
            Giả định các kỳ trước đã trả đúng hạn
          </Check>
          <Check checked={!!scn.carryLeftover} onChange={(carryLeftover) => setScn({ carryLeftover })}>
            Cộng dồn tiền còn lại sang tháng sau
          </Check>
          <Check checked={fromCurrent} onChange={setFromCurrent}>
            Bắt đầu từ tháng đang xem ({formatYM(state.viewMonth)})
          </Check>
        </div>
      </section>

      <section className="tiles">
        <div className="tile">
          <div className="tile-label">Hết nợ trả góp dự kiến</div>
          <div className="tile-value">{result.debtFreeDate ? fmt.date(result.debtFreeDate) : '—'}</div>
          <div className="tile-sub">Không tính chi tiêu thẻ mới</div>
        </div>
        <div className={`tile ${result.firstShortMonth ? 'bad' : 'good'}`}>
          <div className="tile-label">Tháng đầu tiên thiếu tiền</div>
          <div className="tile-value">{result.firstShortMonth ? formatYM(result.firstShortMonth) : 'Không có'}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Tổng phải trả {scn.horizonMonths} tháng</div>
          <div className="tile-value">{fmt.money(sumBy(result.months, (m) => m.outflow))}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Dư nợ cuối kỳ dự phóng</div>
          <div className="tile-value">{fmt.money(result.months.at(-1)?.debtEnd ?? 0)}</div>
        </div>
      </section>

      <section className="panel">
        <StackedColumns
          title="Phải trả mỗi tháng"
          categories={labels}
          series={series}
          values={values}
          format={fmt.money}
          formatTick={(v) => compact.format(minor(v))}
          highlight={(i) => result.months[i].leftover < 0}
        />
        <LineChart
          title="Dư nợ còn lại cuối tháng"
          categories={labels}
          values={result.months.map((m) => m.debtEnd)}
          format={fmt.money}
          formatTick={(v) => compact.format(minor(v))}
        />
      </section>

      <section className="panel">
        <h2>Bảng dự phóng</h2>
        <p className="muted small-text">Sửa ô "Thu nhập" để ghi đè thu nhập của tháng đó; để trống = theo thu nhập định kỳ.</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Tháng</th>
                <th className="r">Trả góp</th>
                <th className="r">Thẻ</th>
                <th className="r">Trả thêm</th>
                <th className="r">Tổng phải trả</th>
                <th className="r">Thu nhập</th>
                {scn.carryLeftover && <th className="r">Chuyển sang</th>}
                <th className="r">Còn lại</th>
                <th className="r">Dư nợ cuối tháng</th>
                <th>Mốc</th>
              </tr>
            </thead>
            <tbody>
              {result.months.map((m) => (
                <tr key={m.month} className={m.leftover < 0 ? 'short' : undefined}>
                  <td>{formatYM(m.month)}</td>
                  <td className="r">{fmt.money(m.installments)}</td>
                  <td className="r">{fmt.money(m.cards)}</td>
                  <td className="r">{m.extra ? fmt.money(m.extra) : ''}</td>
                  <td className="r"><b>{fmt.money(m.outflow)}</b></td>
                  <td className="r">
                    <MoneyInput
                      placeholder={fmt.moneyRaw(sumBy(incomeOccurrences(state.incomes, m.month), (i) => i.amount))}
                      value={scn.incomeOverrides?.[m.month]}
                      onChange={(v) => {
                        const incomeOverrides = { ...scn.incomeOverrides };
                        if (v === undefined) delete incomeOverrides[m.month];
                        else incomeOverrides[m.month] = v;
                        setScn({ incomeOverrides });
                      }}
                    />
                  </td>
                  {scn.carryLeftover && <td className="r">{fmt.money(m.carryIn)}</td>}
                  <td className={`r ${m.leftover < 0 ? 'bad-text' : ''}`}>{fmt.money(m.leftover)}</td>
                  <td className="r">{fmt.money(m.debtEnd)}</td>
                  <td className="small-text">{m.payoffs.map((p) => `Hết nợ ${p.name}`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Trả thêm / trả trước hạn</h2>
        <p className="muted small-text">
          Khoản trả thêm được tính vào số phải trả của tháng và trừ vào dư nợ; app chưa tự tính lại lịch trả sau khi trả trước.
        </p>
        <table>
          <tbody>
            {(scn.extraPayments ?? []).map((e, i) => (
              <tr key={i}>
                <td>
                  <Select
                    value={e.obligationId}
                    onChange={(obligationId) => setScn({ extraPayments: scn.extraPayments!.map((x, j) => (j === i ? { ...x, obligationId } : x)) })}
                    options={engine.open().map((o) => ({ value: o.id, label: o.name }))}
                  />
                </td>
                <td>
                  <input type="month" value={e.month} onChange={(ev) => ev.target.value && setScn({ extraPayments: scn.extraPayments!.map((x, j) => (j === i ? { ...x, month: ev.target.value } : x)) })} />
                </td>
                <td>
                  <MoneyInput value={e.amount} onChange={(v) => setScn({ extraPayments: scn.extraPayments!.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)) })} />
                </td>
                <td>
                  <button className="ghost small" onClick={() => setScn({ extraPayments: scn.extraPayments!.filter((_, j) => j !== i) })}>Xoá</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {engine.open().length > 0 && (
          <button
            className="small"
            onClick={() => setScn({ extraPayments: [...(scn.extraPayments ?? []), { obligationId: engine.open()[0].id, month: from, amount: 0 }] })}
          >
            + Thêm khoản trả thêm
          </button>
        )}
      </section>
    </div>
  );
}
