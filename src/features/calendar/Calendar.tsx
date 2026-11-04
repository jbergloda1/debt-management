import { useState } from 'react';
import { StatusBadge, STATE_LABEL } from '../../components/ui';
import { expenseOccurrences, incomeOccurrences } from '../../domain/cashflow';
import { dayOfWeek, daysInMonth, formatYM, parseYM, toISO } from '../../domain/dates';
import type { DueItem } from '../../domain/types';
import { useEngine, useFmt, useProfile, useSummary } from '../../state/hooks';
import { useStore } from '../../state/store';
import { PaymentModal } from '../payments/PaymentModal';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function Calendar() {
  const state = useProfile();
  const engine = useEngine();
  const summary = useSummary();
  const fmt = useFmt();
  const today = useStore((s) => s.today);
  const [paying, setPaying] = useState<DueItem | null>(null);
  const [y, m] = parseYM(state.viewMonth);
  const days = daysInMonth(y, m);
  const lead = (dayOfWeek(toISO(y, m, 1)) + 6) % 7; // thứ Hai đầu tuần
  const incomes = incomeOccurrences(state.incomes, state.viewMonth);
  const expenses = expenseOccurrences(state.expenses, state.viewMonth);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toISO(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const nameOf = (id: string) => engine.obligation(id)?.name ?? id;

  return (
    <section className="panel">
      <h2>Lịch đến hạn {formatYM(state.viewMonth)}</h2>
      <div className="legend">
        {(['overdue', 'due_soon', 'upcoming', 'partial', 'paid'] as const).map((s) => (
          <span key={s} className="legend-item">
            <span className={`dot ${s}`} /> {STATE_LABEL[s]}
          </span>
        ))}
        <span className="legend-item">
          <span className="dot income" /> Thu nhập
        </span>
        <span className="legend-item">
          <span className="dot expense" /> Chi tiêu
        </span>
      </div>
      <div className="cal">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-head">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell empty" />;
          const items = summary.items.filter((it) => it.dueDate === d);
          const inc = incomes.filter((x) => x.date === d);
          return (
            <div key={d} className={`cal-cell ${d === today ? 'today' : ''}`}>
              <div className="cal-day">{Number(d.slice(8))}</div>
              {inc.map((x) => (
                <div key={x.incomeId} className="cal-item income">+ {x.name} {fmt.money(x.amount)}</div>
              ))}
              {expenses.filter((x) => x.date === d).map((x) => (
                <div key={x.expenseId} className="cal-item expense">− {x.name} {fmt.money(x.amount)}</div>
              ))}
              {items.map((it) => (
                <button
                  key={it.key}
                  className={`cal-item ${it.state} ${it.includedIn ? 'included' : ''}`}
                  title={`${nameOf(it.obligationId)} · ${it.label} · ${STATE_LABEL[it.state]}`}
                  onClick={() => !it.includedIn && it.state !== 'paid' && setPaying(it)}
                >
                  {nameOf(it.obligationId)} {fmt.money(it.amount)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <h3>Danh sách</h3>
      <table className="cards-mobile">
        <tbody>
          {summary.items
            .filter((i) => !i.includedIn)
            .map((it) => (
              <tr key={it.key}>
                <td>{fmt.date(it.dueDate)}</td>
                <td>{nameOf(it.obligationId)} <span className="muted">· {it.label}</span></td>
                <td className="r">{fmt.money(it.amount)}</td>
                <td><StatusBadge state={it.state} /></td>
              </tr>
            ))}
        </tbody>
      </table>
      {paying && <PaymentModal item={paying} title={nameOf(paying.obligationId)} onClose={() => setPaying(null)} />}
    </section>
  );
}
