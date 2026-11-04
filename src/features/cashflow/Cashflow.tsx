import { DateInput, IntInput, MoneyInput, Select, TextInput } from '../../components/inputs';
import { Tile } from '../../components/ui';
import { expenseOccurrences } from '../../domain/cashflow';
import { formatYM } from '../../domain/dates';
import { newId } from '../../domain/defaults';
import { sumBy } from '../../domain/money';
import type { CashAccount, ExpenseCategory, ExpenseEntry, IncomeEntry, IncomeRecurrence } from '../../domain/types';
import { useFmt, useProfile, useSummary, useUpdate } from '../../state/hooks';
import { useStore } from '../../state/store';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'housing', label: 'Nhà ở' },
  { value: 'food', label: 'Ăn uống' },
  { value: 'transport', label: 'Đi lại' },
  { value: 'utilities', label: 'Điện, nước, internet' },
  { value: 'family', label: 'Gia đình, con cái' },
  { value: 'health', label: 'Sức khoẻ, bảo hiểm' },
  { value: 'education', label: 'Học tập' },
  { value: 'entertainment', label: 'Giải trí, mua sắm' },
  { value: 'other', label: 'Khác' },
];
const categoryLabel = (c: ExpenseCategory) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

const KIND_TEXT = { income: 'Thu nhập', expense: 'Chi tiêu', debt: 'Trả nợ' } as const;

/** Chọn "hàng tháng ngày …" hoặc "một lần vào ngày …" (dùng chung cho thu nhập và chi tiêu). */
function RecurrenceEditor({ value, onChange, today }: { value: IncomeRecurrence; onChange: (r: IncomeRecurrence) => void; today: string }) {
  return (
    <span className="recurrence">
      <Select
        value={value.type}
        onChange={(t) => onChange(t === 'once' ? { type: 'once', date: today } : { type: 'monthly', day: Number(today.slice(8)) })}
        options={[
          { value: 'monthly', label: 'Hàng tháng' },
          { value: 'once', label: 'Một lần' },
        ]}
      />
      {value.type === 'monthly' ? (
        <span className="inline">
          ngày <IntInput min={1} max={31} value={value.day} onChange={(day) => onChange({ ...value, day: Math.min(31, Math.max(1, day)) })} />
        </span>
      ) : (
        <DateInput value={value.date} onChange={(date) => date && onChange({ type: 'once', date })} />
      )}
    </span>
  );
}

export function Cashflow() {
  const state = useProfile();
  const update = useUpdate();
  const fmt = useFmt();
  const today = useStore((s) => s.today);
  const { cash } = useSummary();
  const month = state.viewMonth;

  const patchAcc = (id: string, p: Partial<CashAccount>) =>
    update((s) => ({ ...s, cashAccounts: s.cashAccounts.map((a) => (a.id === id ? { ...a, ...p, updatedAt: today } : a)) }));
  const patchInc = (id: string, p: Partial<IncomeEntry>) =>
    update((s) => ({ ...s, incomes: s.incomes.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  const patchExp = (id: string, p: Partial<ExpenseEntry>) =>
    update((s) => ({ ...s, expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...p } : e)) }));

  const monthExpenses = expenseOccurrences(state.expenses, month);
  const byCategory = EXPENSE_CATEGORIES.map((c) => ({ ...c, amount: sumBy(monthExpenses.filter((e) => e.category === c.value), (e) => e.amount) })).filter(
    (c) => c.amount > 0,
  );

  const verdictText = {
    enough: 'Đủ tiền',
    short: `Thiếu ${fmt.money(cash.shortBy)}`,
    short_temporarily: `Thiếu tạm thời ${fmt.money(cash.shortBy)} ngày ${fmt.short(cash.shortDate)}`,
    unknown: 'Chưa nhập tiền',
  }[cash.verdict];

  return (
    <div className="stack">
      <section className="tiles">
        <Tile label="Số dư các tài khoản" value={fmt.money(cash.balances)} />
        <Tile label={`Thu nhập còn về ${formatYM(month)}`} value={fmt.money(cash.incomeExpected)} />
        <Tile label="Chi tiêu còn lại" value={fmt.money(cash.expensesExpected)} />
        <Tile label="Trả nợ còn lại" value={fmt.money(cash.debtOutflow)} />
        <Tile
          label={`${verdictText} — còn lại`}
          value={fmt.money(cash.leftover)}
          sub="Sau khi trả nợ và chi tiêu"
          tone={cash.verdict === 'enough' ? 'good' : cash.verdict === 'unknown' ? undefined : 'bad'}
        />
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Tài khoản tiền</h2>
          <table className="cards-mobile">
            <thead>
              <tr><th>Tên</th><th className="r">Số dư</th><th>Cập nhật</th><th></th></tr>
            </thead>
            <tbody>
              {state.cashAccounts.map((a) => (
                <tr key={a.id}>
                  <td><TextInput value={a.name} onChange={(name) => patchAcc(a.id, { name })} /></td>
                  <td className="r"><MoneyInput value={a.balance} onChange={(v) => patchAcc(a.id, { balance: v ?? 0 })} /></td>
                  <td className="muted small-text">{fmt.short(a.updatedAt)}</td>
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
          <table className="cards-mobile">
            <thead>
              <tr><th>Tên</th><th className="r">Số tiền</th><th>Khi nào</th><th></th></tr>
            </thead>
            <tbody>
              {state.incomes.map((inc) => (
                <tr key={inc.id}>
                  <td><TextInput value={inc.name} onChange={(name) => patchInc(inc.id, { name })} /></td>
                  <td className="r"><MoneyInput value={inc.amount} onChange={(v) => patchInc(inc.id, { amount: v ?? 0 })} /></td>
                  <td className="wide"><RecurrenceEditor value={inc.recurrence} today={today} onChange={(recurrence) => patchInc(inc.id, { recurrence })} /></td>
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

      <section className="panel" aria-label="Chi tiêu">
        <div className="panel-head">
          <h2>Chi tiêu</h2>
          <span className="muted">
            Tháng {formatYM(month)}: <b>{fmt.money(sumBy(monthExpenses, (e) => e.amount))}</b>
          </span>
        </div>
        <p className="muted small-text">
          Chi tiêu sinh hoạt trả bằng tiền mặt / tài khoản — trừ vào tiền hiện có cùng với tiền trả nợ. Chi tiêu bằng thẻ tín dụng đã nằm trong
          dư nợ thẻ, không nhập ở đây. Khoản đã chi trước hôm nay trong tháng coi như đã trừ vào số dư.
        </p>
        <table className="cards-mobile">
          <thead>
            <tr><th>Tên</th><th>Nhóm</th><th className="r">Số tiền</th><th>Khi nào</th><th></th></tr>
          </thead>
          <tbody>
            {state.expenses.map((e) => (
              <tr key={e.id}>
                <td><TextInput value={e.name} onChange={(name) => patchExp(e.id, { name })} /></td>
                <td><Select value={e.category} onChange={(category) => patchExp(e.id, { category })} options={EXPENSE_CATEGORIES} /></td>
                <td className="r"><MoneyInput value={e.amount} onChange={(v) => patchExp(e.id, { amount: v ?? 0 })} /></td>
                <td className="wide"><RecurrenceEditor value={e.recurrence} today={today} onChange={(recurrence) => patchExp(e.id, { recurrence })} /></td>
                <td>
                  <button className="ghost small" onClick={() => update((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== e.id) }))}>
                    Xoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button
            className="small"
            onClick={() =>
              update((s) => ({
                ...s,
                expenses: [...s.expenses, { id: newId('exp'), name: 'Chi tiêu hàng tháng', category: 'food', amount: 0, recurrence: { type: 'monthly', day: 1, from: s.viewMonth } }],
              }))
            }
          >
            + Chi tiêu hàng tháng
          </button>
          <button
            className="small"
            onClick={() =>
              update((s) => ({
                ...s,
                expenses: [...s.expenses, { id: newId('exp'), name: 'Khoản chi', category: 'other', amount: 0, recurrence: { type: 'once', date: today } }],
              }))
            }
          >
            + Khoản chi một lần
          </button>
        </div>
        {byCategory.length > 0 && (
          <div className="category-breakdown">
            {byCategory.map((c) => (
              <span key={c.value} className="category-chip">
                {categoryLabel(c.value)} <b>{fmt.money(c.amount)}</b>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Dòng tiền theo ngày — {formatYM(month)}</h2>
        <p className="muted small-text">
          Bắt đầu từ số dư hiện tại; trong cùng một ngày, tiền về được tính trước khoản chi. Khoản trong sao kê thẻ không tính riêng.
        </p>
        {cash.timeline.length === 0 ? (
          <p className="muted">Không có khoản thu/chi nào còn lại trong tháng.</p>
        ) : (
          <table className="cards-mobile timeline">
            <thead>
              <tr><th>Nội dung</th><th>Ngày</th><th className="r">Thu / chi</th><th className="r">Số dư sau</th></tr>
            </thead>
            <tbody>
              <tr className="muted">
                <td>Số dư hiện tại</td><td></td><td></td><td className="r">{fmt.money(cash.balances)}</td>
              </tr>
              {cash.timeline.map((e, i) => (
                <tr key={i} className={e.balance < 0 ? 'short' : undefined}>
                  <td>
                    <span className={`kind-dot ${e.kind}`} aria-hidden /> {e.label} <span className="muted small-text">· {KIND_TEXT[e.kind]}</span>
                  </td>
                  <td>{fmt.date(e.date)}</td>
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
