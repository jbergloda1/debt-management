import { DateInput, IntInput, MoneyInput, Select, TextInput } from '../../components/inputs';
import { Tile } from '../../components/ui';
import { formatYM } from '../../domain/dates';
import { newId } from '../../domain/defaults';
import type { CashAccount, IncomeEntry } from '../../domain/types';
import { useFmt, useProfile, useSummary, useUpdate } from '../../state/hooks';
import { useStore } from '../../state/store';

export function Cashflow() {
  const state = useProfile();
  const update = useUpdate();
  const fmt = useFmt();
  const today = useStore((s) => s.today);
  const { cash } = useSummary();

  const patchAcc = (id: string, p: Partial<CashAccount>) =>
    update((s) => ({ ...s, cashAccounts: s.cashAccounts.map((a) => (a.id === id ? { ...a, ...p, updatedAt: today } : a)) }));
  const patchInc = (id: string, p: Partial<IncomeEntry>) =>
    update((s) => ({ ...s, incomes: s.incomes.map((i) => (i.id === id ? { ...i, ...p } : i)) }));

  const verdictText = {
    enough: 'Đủ tiền trả nợ',
    short: `Thiếu ${fmt.money(cash.shortBy)}`,
    short_temporarily: `Thiếu tạm thời ${fmt.money(cash.shortBy)} ngày ${fmt.date(cash.shortDate)}`,
    unknown: 'Chưa nhập tiền',
  }[cash.verdict];

  return (
    <div className="stack">
      <section className="tiles">
        <Tile label="Số dư các tài khoản" value={fmt.money(cash.balances)} />
        <Tile label={`Thu nhập còn về trong ${formatYM(state.viewMonth)}`} value={fmt.money(cash.incomeExpected)} />
        <Tile label="Còn lại sau khi trả nợ" value={fmt.money(cash.leftover)} tone={cash.leftover < 0 ? 'bad' : 'good'} />
        <Tile label="Kết luận" value={verdictText} tone={cash.verdict === 'enough' ? 'good' : cash.verdict === 'unknown' ? undefined : 'bad'} />
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Tài khoản tiền</h2>
          <table>
            <tbody>
              {state.cashAccounts.map((a) => (
                <tr key={a.id}>
                  <td><TextInput value={a.name} onChange={(name) => patchAcc(a.id, { name })} /></td>
                  <td className="r"><MoneyInput value={a.balance} onChange={(v) => patchAcc(a.id, { balance: v ?? 0 })} /></td>
                  <td className="muted small-text">cập nhật {fmt.short(a.updatedAt)}</td>
                  <td>
                    <button className="ghost small" onClick={() => update((s) => ({ ...s, cashAccounts: s.cashAccounts.filter((x) => x.id !== a.id) }))}>
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="small"
            onClick={() => update((s) => ({ ...s, cashAccounts: [...s.cashAccounts, { id: newId('acc'), name: 'Tài khoản mới', balance: 0, updatedAt: today }] }))}
          >
            + Thêm tài khoản
          </button>
        </section>

        <section className="panel">
          <h2>Thu nhập</h2>
          <table>
            <tbody>
              {state.incomes.map((inc) => (
                <tr key={inc.id}>
                  <td><TextInput value={inc.name} onChange={(name) => patchInc(inc.id, { name })} /></td>
                  <td className="r"><MoneyInput value={inc.amount} onChange={(v) => patchInc(inc.id, { amount: v ?? 0 })} /></td>
                  <td>
                    <Select
                      value={inc.recurrence.type}
                      onChange={(t) =>
                        patchInc(inc.id, { recurrence: t === 'once' ? { type: 'once', date: today } : { type: 'monthly', day: 10 } })
                      }
                      options={[
                        { value: 'monthly', label: 'Hàng tháng' },
                        { value: 'once', label: 'Một lần' },
                      ]}
                    />
                  </td>
                  <td>
                    {inc.recurrence.type === 'monthly' ? (
                      <span className="inline">
                        ngày <IntInput min={1} max={31} value={inc.recurrence.day} onChange={(day) => patchInc(inc.id, { recurrence: { ...inc.recurrence, day } as IncomeEntry['recurrence'] })} />
                      </span>
                    ) : (
                      <DateInput value={inc.recurrence.date} onChange={(date) => date && patchInc(inc.id, { recurrence: { type: 'once', date } })} />
                    )}
                  </td>
                  <td>
                    <button className="ghost small" onClick={() => update((s) => ({ ...s, incomes: s.incomes.filter((x) => x.id !== inc.id) }))}>
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="small"
            onClick={() =>
              update((s) => ({
                ...s,
                incomes: [...s.incomes, { id: newId('inc'), name: 'Lương', amount: 0, recurrence: { type: 'monthly', day: 10, from: s.viewMonth } }],
              }))
            }
          >
            + Thêm thu nhập
          </button>
        </section>
      </div>

      <section className="panel">
        <h2>Dòng tiền theo ngày — {formatYM(state.viewMonth)}</h2>
        <p className="muted small-text">
          Bắt đầu từ số dư hiện tại; trong cùng một ngày, tiền về được tính trước khoản phải trả. Khoản trong sao kê thẻ không tính riêng.
        </p>
        {cash.timeline.length === 0 ? (
          <p className="muted">Không có khoản thu/chi nào còn lại trong tháng.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Ngày</th><th>Nội dung</th><th className="r">Thu / chi</th><th className="r">Số dư sau</th></tr>
            </thead>
            <tbody>
              <tr className="muted">
                <td></td><td>Số dư hiện tại</td><td></td><td className="r">{fmt.money(cash.balances)}</td>
              </tr>
              {cash.timeline.map((e, i) => (
                <tr key={i} className={e.balance < 0 ? 'short' : undefined}>
                  <td>{fmt.date(e.date)}</td>
                  <td>{e.label}</td>
                  <td className={`r ${e.delta > 0 ? 'good-text' : ''}`}>{e.delta > 0 ? '+' : '−'}{fmt.money(Math.abs(e.delta))}</td>
                  <td className={`r ${e.balance < 0 ? 'bad-text' : ''}`}>{fmt.money(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
