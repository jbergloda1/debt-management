import { Fragment, useState } from 'react';
import { MoneyInput } from '../../components/inputs';
import { AlertList, daysText, Empty, StatusBadge, Tile } from '../../components/ui';
import { daysUntil, formatYM } from '../../domain/dates';
import { groupRowsByDate, type SummaryRow } from '../../domain/summary';
import type { DueItem } from '../../domain/types';
import { useAlerts, useEngine, useFmt, useProfile, useSummary, useUpdate } from '../../state/hooks';
import { useNav } from '../../state/nav';
import { useStore } from '../../state/store';
import { PaymentModal } from '../payments/PaymentModal';
import { BackupBanner } from '../backup/BackupBanner';

const VERDICT = {
  enough: { text: 'Đủ tiền trả nợ', tone: 'good' as const },
  short: { text: 'Thiếu tiền', tone: 'bad' as const },
  short_temporarily: { text: 'Thiếu tạm thời', tone: 'warn' as const },
  unknown: { text: 'Chưa nhập tiền hiện có', tone: undefined },
};

export function Dashboard() {
  const state = useProfile();
  const engine = useEngine();
  const summary = useSummary();
  const alerts = useAlerts();
  const fmt = useFmt();
  const update = useUpdate();
  const today = useStore((s) => s.today);
  const go = useNav((n) => n.go);
  const [paying, setPaying] = useState<DueItem | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const grouped = state.profile.settings.groupByDate;
  const rows = grouped ? groupRowsByDate(summary.rows) : summary.rows;
  const { totals, cash } = summary;
  const v = VERDICT[cash.verdict];

  const nameOf = (id: string) => engine.obligation(id)?.name ?? id;
  const setPlanned = (key: string, value: number | undefined) =>
    update((s) => {
      const plannedAmounts = { ...s.plannedAmounts };
      if (value === undefined) delete plannedAmounts[key];
      else plannedAmounts[key] = value;
      return { ...s, plannedAmounts };
    });

  const itemRow = (it: DueItem, child = false) => (
    <tr key={it.key} className={`${child ? 'child' : 'sub'} ${it.state === 'paid' ? 'done' : ''}`}>
      <td className="indent">
        {nameOf(it.obligationId)} <span className="muted">· {it.label}</span>
        {child && <span className="muted"> (đã nằm trong sao kê)</span>}
      </td>
      <td>{fmt.date(it.dueDate)}</td>
      <td className="r">{fmt.money(it.amount)}</td>
      <td className="r">
        {!child && it.state !== 'paid' && (
          <MoneyInput placeholder={fmt.moneyRaw(it.amount)} value={it.plannedAmount} onChange={(v) => setPlanned(it.key, v)} />
        )}
      </td>
      <td className="r">{it.paidAmount > 0 ? fmt.money(it.paidAmount) : ''}</td>
      <td></td>
      <td><StatusBadge state={it.state} /></td>
      <td>
        {!child && it.state !== 'paid' && (
          <button className="small" onClick={() => setPaying(it)}>
            Ghi nhận
          </button>
        )}
      </td>
    </tr>
  );

  const mainRow = (r: SummaryRow) => {
    const expandable = r.items.length > 1 || r.children.length > 0 || r.memberIds.length > 1;
    const single = r.items.length === 1 && r.memberIds.length === 1 ? r.items[0] : undefined;
    const isOpen = open[r.key] ?? false;
    const d = r.dueDate ? daysUntil(r.dueDate, today) : undefined;
    return (
      <Fragment key={r.key}>
        <tr className={r.state === 'paid' ? 'done' : undefined}>
          <td>
            {expandable && (
              <button className="ghost tiny" onClick={() => setOpen({ ...open, [r.key]: !isOpen })} aria-label="Mở chi tiết">
                {isOpen ? '▾' : '▸'}
              </button>
            )}
            {r.memberIds.length === 1 ? (
              <button className="link" onClick={() => go('obligation', r.obligationId)}>
                {r.label}
              </button>
            ) : (
              r.label
            )}
            <div className="note">
              {r.institution}
              {single && ` · ${single.label}`}
              {r.children.length > 0 && ` · gồm ${r.children.length} kỳ trả góp`}
            </div>
          </td>
          <td>
            {fmt.date(r.dueDate)}
            {d !== undefined && r.state !== 'paid' && r.state !== 'not_yet' && <div className="note">{daysText(d)}</div>}
          </td>
          <td className="r">{fmt.money(r.amount)}</td>
          <td className="r">
            {single && single.state !== 'paid' ? (
              <MoneyInput placeholder={fmt.moneyRaw(single.amount)} value={single.plannedAmount} onChange={(v) => setPlanned(single.key, v)} />
            ) : r.planned !== r.amount ? (
              fmt.money(r.planned)
            ) : null}
          </td>
          <td className="r">{r.paidAmount > 0 ? fmt.money(r.paidAmount) : ''}</td>
          <td className="r">{fmt.money(r.debtRemaining)}</td>
          <td><StatusBadge state={r.state} /></td>
          <td>
            {single && single.state !== 'paid' && (
              <button className="small" onClick={() => setPaying(single)}>
                Ghi nhận
              </button>
            )}
          </td>
        </tr>
        {isOpen && (single ? [] : r.items).map((it) => itemRow(it))}
        {isOpen && r.children.map((it) => itemRow(it, true))}
      </Fragment>
    );
  };

  return (
    <div className="stack">
      <div className="dashboard-intro flex flex-wrap items-end justify-between gap-4"><div><span className="eyebrow">TỔNG QUAN TÀI CHÍNH</span><h1>Chủ động hôm nay,<br className="intro-break" /> an tâm ngày mai.</h1><p className="muted">Theo dõi các khoản nợ và kế hoạch thanh toán của bạn trong một nơi.</p></div><button className="primary" onClick={() => go('obligations')}>＋ Quản lý khoản nợ</button></div>
      <BackupBanner />
      <section className="tiles">
        <Tile label={`Phải trả ${formatYM(state.viewMonth)}`} value={fmt.money(totals.payable)} sub={totals.planned !== totals.payable ? `Dự định ${fmt.money(totals.planned)}` : undefined} />
        <Tile label="Đã trả" value={fmt.money(totals.paid)} />
        <Tile label="Còn phải trả" value={fmt.money(totals.unpaid)} sub={totals.dueSoonOrOverdue ? `${totals.dueSoonOrOverdue} khoản sắp/quá hạn` : undefined} tone={totals.dueSoonOrOverdue ? 'warn' : undefined} />
        <Tile label="Tổng dư nợ" value={fmt.money(totals.debt)} />
        <Tile
          label={v.text}
          value={cash.verdict === 'unknown' ? '—' : fmt.money(cash.leftover)}
          sub={
            cash.verdict === 'unknown' ? (
              <button className="link" onClick={() => go('cashflow')}>Nhập tiền hiện có →</button>
            ) : cash.verdict === 'short_temporarily' ? (
              `Thiếu ${fmt.money(cash.shortBy)} ngày ${fmt.short(cash.shortDate)}`
            ) : (
              `Có ${fmt.money(cash.available)} · còn lại sau khi trả`
            )
          }
          tone={v.tone}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Các khoản tháng {formatYM(state.viewMonth, state.profile.locale)}</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={grouped}
              onChange={(e) =>
                update((s) => ({ ...s, profile: { ...s.profile, settings: { ...s.profile.settings, groupByDate: e.target.checked } } }))
              }
            />
            Gộp theo ngày
          </label>
        </div>
        {rows.length === 0 ? (
          <Empty>
            Chưa có khoản nợ nào. <button className="link" onClick={() => go('obligations')}>Thêm khoản nợ →</button>
          </Empty>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Khoản</th>
                  <th>Đến hạn</th>
                  <th className="r">Phải trả</th>
                  <th className="r">Dự định trả</th>
                  <th className="r">Đã trả</th>
                  <th className="r">Dư nợ</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>{rows.map(mainRow)}</tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Tổng</td>
                  <td className="r">{fmt.money(totals.payable)}</td>
                  <td className="r">{fmt.money(totals.planned)}</td>
                  <td className="r">{fmt.money(totals.paid)}</td>
                  <td className="r">{fmt.money(totals.debt)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Cảnh báo</h2>
          <AlertList items={alerts} onOpen={(id) => go('obligation', id)} />
        </section>
        <section className="panel">
          <h2>Theo tổ chức</h2>
          <table>
            <thead>
              <tr><th>Tổ chức</th><th className="r">Phải trả tháng này</th><th className="r">Dư nợ</th></tr>
            </thead>
            <tbody>
              {Object.entries(summary.byInstitution).map(([id, b]) => (
                <tr key={id}>
                  <td>{b.name}</td>
                  <td className="r">{fmt.money(b.payable)}</td>
                  <td className="r">{fmt.money(b.debt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {paying && <PaymentModal item={paying} title={nameOf(paying.obligationId)} onClose={() => setPaying(null)} />}
    </div>
  );
}
