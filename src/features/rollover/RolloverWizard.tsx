import { Steps } from 'antd';
import { useMemo, useState } from 'react';
import { DateInput, Field, MoneyInput } from '../../components/inputs';
import { Modal } from '../../components/ui';
import { formatYM } from '../../domain/dates';
import { newId } from '../../domain/defaults';
import { createEngine } from '../../domain/engine';
import { applyRollover, defaultPayment, planRollover, type RolloverInput } from '../../domain/rollover';
import { monthlySummary } from '../../domain/summary';
import type { YearMonth } from '../../domain/types';
import { useBackup } from '../../state/backup';
import { useEngine, useFmt, useProfile, useUpdate } from '../../state/hooks';
import { useStore } from '../../state/store';

type PayDraft = { checked: boolean; amount?: number; date?: string };
type StmtDraft = { statementDate?: string; dueDate?: string; statementBalance?: number; currentBalance?: number; minimumDue?: number };

const STEPS = ['Thanh toán tháng trước', 'Sao kê mới', 'Tiền hiện có', 'Xem lại'];

/** "Sang tháng mới": đánh dấu khoản đã trả, nhập sao kê mới, cập nhật tiền — chỉ lưu khi bấm Hoàn tất. */
export function RolloverWizard({ target, onClose }: { target: YearMonth; onClose: () => void }) {
  const state = useProfile();
  const engine = useEngine();
  const update = useUpdate();
  const fmt = useFmt();
  const today = useStore((s) => s.today);
  const setNotice = useStore((s) => s.setNotice);
  const backupNow = useBackup((s) => s.backupNow);
  const plan = useMemo(() => planRollover(engine, target), [engine, target]);
  const [step, setStep] = useState(0);

  const [pays, setPays] = useState<Record<string, PayDraft>>(() =>
    Object.fromEntries(plan.openItems.map((it) => [it.key, { checked: false, ...defaultPayment(it, today) }])),
  );
  const [stmts, setStmts] = useState<Record<string, StmtDraft>>(() =>
    Object.fromEntries(plan.cards.filter((c) => !c.existing).map((c) => [c.obligationId, { statementDate: c.statementDate, dueDate: c.dueDate }])),
  );
  const [cash, setCash] = useState<Record<string, number | undefined>>(() => Object.fromEntries(state.cashAccounts.map((a) => [a.id, a.balance])));

  const input: RolloverInput = {
    target,
    payments: plan.openItems
      .filter((it) => pays[it.key]?.checked && pays[it.key].amount && pays[it.key].date)
      .map((it) => ({ itemKey: it.key, obligationId: it.obligationId, amount: pays[it.key].amount!, date: pays[it.key].date! })),
    statements: Object.entries(stmts)
      .filter(([, s]) => s.statementBalance !== undefined && s.statementDate && s.dueDate)
      .map(([obligationId, s]) => ({
        obligationId,
        statementDate: s.statementDate!,
        dueDate: s.dueDate!,
        statementBalance: s.statementBalance!,
        currentBalance: s.currentBalance ?? s.statementBalance!,
        minimumDue: s.minimumDue,
      })),
    cash: Object.entries(cash).map(([id, balance]) => ({ id, balance: balance ?? 0 })),
  };

  const inputKey = JSON.stringify(input);
  const preview = useMemo(
    () => monthlySummary(createEngine(applyRollover(state, JSON.parse(inputKey), today, (p) => `preview-${p}`), today), target),
    [state, today, target, inputKey],
  );

  const nameOf = (id: string) => engine.obligation(id)?.name ?? id;
  const allChecked = plan.openItems.length > 0 && plan.openItems.every((it) => pays[it.key]?.checked);
  const setPay = (key: string, p: Partial<PayDraft>) => setPays((x) => ({ ...x, [key]: { ...x[key], ...p } }));
  const setStmt = (id: string, p: Partial<StmtDraft>) => setStmts((x) => ({ ...x, [id]: { ...x[id], ...p } }));
  const missingStatements = plan.cards.filter((c) => !c.existing && stmts[c.obligationId]?.statementBalance === undefined);

  const finish = (andBackup: boolean) => {
    const next = applyRollover(state, input, today, newId);
    update(() => next);
    setNotice(`Đã chuyển sang tháng ${formatYM(target)}.`);
    // Sao lưu ngay trong sự kiện bấm (bảng Chia sẻ cần thao tác người dùng)
    if (andBackup) backupNow(next).catch(() => undefined);
    onClose();
  };

  const footer = (
    <div className="wizard-foot">
      <button onClick={step === 0 ? onClose : () => setStep(step - 1)}>{step === 0 ? 'Huỷ' : '← Quay lại'}</button>
      <span className="spacer" />
      {step < STEPS.length - 1 ? (
        <button className="primary" onClick={() => setStep(step + 1)}>Tiếp →</button>
      ) : (
        <>
          <button onClick={() => finish(false)}>Hoàn tất</button>
          <button className="primary" onClick={() => finish(true)}>Hoàn tất & sao lưu</button>
        </>
      )}
    </div>
  );

  return (
    <Modal wide title={`Sang tháng mới — ${formatYM(target)}`} onClose={onClose} footer={footer}>
      <Steps size="small" current={step} onChange={setStep} items={STEPS.map((title) => ({ title }))} className="wizard-steps" />
      <p className="wizard-progress">
        Bước {step + 1}/{STEPS.length} · <b>{STEPS[step]}</b>
      </p>

      {step === 0 && (
        <section aria-label={STEPS[0]}>
          {plan.openItems.length === 0 ? (
            <p className="muted">Không còn khoản nào chưa trả trước tháng {formatYM(target)}. ✓</p>
          ) : (
            <>
              <p className="small-text">
                Tick các khoản <b>đã trả</b>. Số tiền và ngày trả điền sẵn, sửa nếu khác. Khoản không tick vẫn là chưa trả (sẽ báo quá hạn).
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => setPays((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v, checked: e.target.checked }])))}
                />
                Đã trả tất cả
              </label>
              <ul className="pay-list">
                {plan.openItems.map((it) => {
                  const p = pays[it.key];
                  return (
                    <li key={it.key} className={`pay-item ${p.checked ? '' : 'unchecked'}`}>
                      <label className="pay-check">
                        <input type="checkbox" aria-label={`Đã trả ${nameOf(it.obligationId)}`} checked={p.checked} onChange={(e) => setPay(it.key, { checked: e.target.checked })} />
                        <span>
                          <b>{nameOf(it.obligationId)}</b> <span className="muted">· {it.label}</span>
                          <span className="pay-due">Hạn {fmt.date(it.dueDate)} · {fmt.money(it.amount - it.paidAmount)}</span>
                        </span>
                      </label>
                      <div className="pay-fields">
                        <Field label="Số tiền đã trả"><MoneyInput value={p.amount} onChange={(amount) => setPay(it.key, { amount, checked: true })} /></Field>
                        <Field label="Ngày trả"><DateInput value={p.date} onChange={(date) => setPay(it.key, { date, checked: true })} /></Field>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {step === 1 && (
        <section aria-label={STEPS[1]} className="stack">
          {plan.cards.length === 0 && <p className="muted">Không có thẻ nào cần sao kê cho tháng {formatYM(target)}.</p>}
          {plan.cards.map((c) => (
            <div key={c.obligationId} className="wizard-card">
              <h3>{c.name}</h3>
              {c.existing ? (
                <p className="small-text">
                  ✓ Đã có sao kê {fmt.date(c.existing.statementDate)}, hạn {fmt.date(c.existing.dueDate)}: {fmt.money(c.existing.currentBalance)}
                </p>
              ) : (
                <>
                  {c.billed.length > 0 && (
                    <p className="notice small-text">
                      Sao kê này đã gồm {c.billed.map((b) => `${b.label}: ${fmt.money(b.amount)}`).join('; ')} — không cần cộng thêm.
                    </p>
                  )}
                  <div className="form" role="group" aria-label={`Sao kê ${c.name}`}>
                    <Field label="Ngày sao kê"><DateInput value={stmts[c.obligationId].statementDate} onChange={(statementDate) => setStmt(c.obligationId, { statementDate })} /></Field>
                    <Field label="Ngày đến hạn"><DateInput value={stmts[c.obligationId].dueDate} onChange={(dueDate) => setStmt(c.obligationId, { dueDate })} /></Field>
                    <Field label="Dư nợ sao kê"><MoneyInput value={stmts[c.obligationId].statementBalance} onChange={(statementBalance) => setStmt(c.obligationId, { statementBalance })} /></Field>
                    <Field label="Dư nợ hiện tại" hint="Để trống = bằng dư nợ sao kê">
                      <MoneyInput value={stmts[c.obligationId].currentBalance} onChange={(currentBalance) => setStmt(c.obligationId, { currentBalance })} />
                    </Field>
                  </div>
                </>
              )}
            </div>
          ))}
          {missingStatements.length > 0 && (
            <p className="muted small-text">Chưa có sao kê thì để trống — nhập sau ở Thẻ & hạn mức. App sẽ nhắc "chưa nhập sao kê".</p>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-label={STEPS[2]}>
          {state.cashAccounts.length === 0 ? (
            <p className="muted">Chưa có tài khoản tiền nào — thêm ở mục Dòng tiền để app kiểm tra đủ/thiếu tiền.</p>
          ) : (
            <div className="form">
              {state.cashAccounts.map((a) => (
                <Field key={a.id} label={a.name} hint={`Cập nhật lần cuối ${fmt.date(a.updatedAt)}`}>
                  <MoneyInput value={cash[a.id]} onChange={(v) => setCash((x) => ({ ...x, [a.id]: v }))} />
                </Field>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section aria-label={STEPS[3]}>
          <ul className="wizard-review">
            <li>Ghi nhận <b>{input.payments.length}</b> khoản đã trả{input.payments.length > 0 && <> · {fmt.money(input.payments.reduce((s, p) => s + p.amount, 0))}</>}</li>
            <li>Thêm <b>{input.statements.length}</b> sao kê mới{missingStatements.length > 0 && <> · chưa nhập: {missingStatements.map((c) => c.name).join(', ')}</>}</li>
            <li>Tiền hiện có: <b>{fmt.money(input.cash.reduce((s, c) => s + c.balance, 0))}</b></li>
          </ul>
          <div className="tiles small">
            <div className="tile"><div className="tile-label">Phải trả {formatYM(target)}</div><div className="tile-value">{fmt.money(preview.totals.payable)}</div></div>
            <div className="tile"><div className="tile-label">Tổng dư nợ</div><div className="tile-value">{fmt.money(preview.totals.debt)}</div></div>
            <div className={`tile ${preview.cash.verdict === 'enough' ? 'good' : preview.cash.verdict === 'unknown' ? '' : 'bad'}`}>
              <div className="tile-label">{preview.cash.verdict === 'enough' ? 'Đủ tiền — còn lại' : preview.cash.verdict === 'unknown' ? 'Tiền hiện có' : 'Thiếu tiền'}</div>
              <div className="tile-value">{fmt.money(preview.cash.leftover)}</div>
            </div>
          </div>
          <p className="muted small-text">Chưa có gì được lưu cho tới khi bấm Hoàn tất. Nên sao lưu sau khi cập nhật.</p>
        </section>
      )}
    </Modal>
  );
}
