import { useMemo, useState } from 'react';
import { Check, DateInput, Field, IntInput, MoneyInput, PercentInput, Select, TextInput } from '../../components/inputs';
import { DueRuleEditor, FeeListEditor, InterestModelEditor } from '../../components/ruleEditors';
import { Modal } from '../../components/ui';
import { builtinPresets, institutionFromPreset, type InstitutionPreset } from '../../data/presets';
import { setDay, monthOf, addMonthsYM } from '../../domain/dates';
import { newId } from '../../domain/defaults';
import { generateDueDates } from '../../domain/rules';
import { expectedPaidAt } from '../../domain/ledger';
import { loanMetrics } from '../../domain/metrics';
import { buildSchedule } from '../../domain/schedule';
import type {
  CardPaymentPolicy,
  CreditLine,
  Institution,
  InstitutionType,
  Obligation,
  ObligationKind,
  Statement,
} from '../../domain/types';
import { validateObligation } from '../../domain/validation';
import { creditLineNameFor, guessParentCard } from '../../domain/links';
import { useFmt, useProfile, useUpdate } from '../../state/hooks';
import { useStore } from '../../state/store';

const KINDS: { value: ObligationKind; label: string }[] = [
  { value: 'installment_loan', label: 'Vay trả góp' },
  { value: 'credit_card', label: 'Thẻ tín dụng' },
  { value: 'revolving', label: 'Hạn mức / thấu chi' },
  { value: 'custom', label: 'Nợ tự định nghĩa (lịch nhập tay)' },
];

const INST_TYPES: { value: InstitutionType; label: string }[] = [
  { value: 'bank', label: 'Ngân hàng' },
  { value: 'finance_company', label: 'Công ty tài chính' },
  { value: 'bnpl', label: 'Ví trả sau / BNPL' },
  { value: 'individual', label: 'Cá nhân' },
  { value: 'other', label: 'Khác' },
];

const PICK = '__pick';

type PolicyChoice = 'inherit' | 'current_balance' | 'statement_balance' | 'minimum' | 'fixed';

function blank(kind: ObligationKind, profileId: string, institutionId: string, today: string, inst?: Institution): Obligation {
  const base = { id: newId('ob'), profileId, institutionId, name: '', status: 'active' as const, createdAt: today };
  switch (kind) {
    case 'credit_card':
      return { ...base, kind, creditLineId: newId('cl'), statementDay: 25, dueRule: { type: 'statement_fixed_due', statementDay: 25, dueDay: 10 } };
    case 'revolving':
      return { ...base, kind, creditLineId: newId('cl'), dueRule: { type: 'fixed_day', day: 25, cutoffDay: 31, offsetIfOnOrBeforeCutoff: 1, offsetIfAfterCutoff: 1 }, annualRate: 0.2 };
    case 'custom':
      return { ...base, kind, schedule: [] };
    default:
      return {
        ...base,
        kind: 'installment_loan',
        principal: 0,
        startDate: today,
        periods: 12,
        interestModel: structuredClone(inst?.defaults?.interestModel) ?? { type: 'fixed_installment', installment: 0 },
        dueRule: structuredClone(inst?.defaults?.dueDateRule) ?? { type: 'same_day_as_start', offsetMonths: 1 },
      };
  }
}

export function ObligationForm({ initial, onClose }: { initial?: Obligation; onClose: (savedId?: string) => void }) {
  const state = useProfile();
  const update = useUpdate();
  const today = useStore((s) => s.today);
  const fmt = useFmt();
  const editing = !!initial;

  // --- tổ chức ---
  const [newInst, setNewInst] = useState<Institution | null>(state.institutions.length ? null : { id: newId('inst'), name: '', type: 'bank' });
  const [presetKey, setPresetKey] = useState('');
  const institutions = newInst ? [...state.institutions, newInst] : state.institutions;
  const [instId, setInstId] = useState(initial?.institutionId ?? newInst?.id ?? state.institutions[0]?.id ?? '');
  const inst = institutions.find((i) => i.id === instId);
  const preset: InstitutionPreset | undefined = builtinPresets.find((p) => p.key === presetKey);

  // --- khoản nợ ---
  const [ob, setOb] = useState<Obligation>(() => initial ?? blank('installment_loan', state.profile.id, instId, today, inst));
  const set = (p: Partial<Obligation>) => setOb((o) => ({ ...o, ...p }) as Obligation);
  const line = state.creditLines.find((l) => 'creditLineId' in ob && l.id === ob.creditLineId);
  const [limit, setLimit] = useState<number | undefined>(line?.limit);
  const [firstStatement, setFirstStatement] = useState<Partial<Statement>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const changeKind = (kind: ObligationKind) => setOb({ ...blank(kind, state.profile.id, instId, today, inst), name: ob.name });

  const applyPreset = (key: string) => {
    setPresetKey(key);
    const p = builtinPresets.find((x) => x.key === key);
    if (!p) return;
    const created = institutionFromPreset(p, newInst?.name || p.institution.name);
    setNewInst(created);
    setInstId(created.id);
  };

  const applyTemplate = (idx: number) => {
    const t = preset?.obligationTemplates[idx];
    if (!t) return;
    const next = { ...blank(t.kind, state.profile.id, instId, today, inst), ...structuredClone(t.defaults), name: ob.name || t.label } as Obligation;
    if (next.kind === 'installment_loan' && next.link && !next.link.parentObligationId) {
      const card = guessParentCard(next, { obligations: state.obligations, institutions });
      if (card) next.link = { ...next.link, parentObligationId: card.id, creditLineId: card.creditLineId };
    }
    setOb(next);
  };

  const cards = state.obligations.filter((o) => (o.kind === 'credit_card' || o.kind === 'revolving') && o.id !== ob.id);

  // xem trước bảng kỳ hạn
  const preview = useMemo(() => {
    if (ob.kind !== 'installment_loan' || !(ob.principal > 0) || !(ob.periods > 0)) return null;
    try {
      const rows = buildSchedule(ob, inst, state.profile.settings);
      const metrics = loanMetrics(ob, inst, state.profile.settings);
      return { rows, metrics };
    } catch {
      return null;
    }
  }, [ob, inst, state.profile.settings]);

  const policyChoice: PolicyChoice =
    ob.kind !== 'credit_card' || !ob.paymentPolicy ? 'inherit' : typeof ob.paymentPolicy === 'object' ? 'fixed' : ob.paymentPolicy;

  const save = () => {
    const final = { ...ob, institutionId: instId } as Obligation;
    const errs = validateObligation(final, today);
    if (!instId || (newInst && newInst.id === instId && !newInst.name.trim())) errs.unshift('Cần chọn hoặc đặt tên tổ chức');
    if ((final.kind === 'credit_card' || final.kind === 'revolving') && !limit) errs.push('Cần nhập hạn mức');
    if (final.kind === 'custom' && final.schedule.length === 0) errs.push('Cần ít nhất một ngày trả');
    if (errs.length) return setErrors(errs);

    update((s) => {
      let next = { ...s };
      if (newInst && newInst.id === instId && !s.institutions.some((i) => i.id === instId)) {
        next.institutions = [...s.institutions, newInst];
      }
      if (final.kind === 'credit_card' || final.kind === 'revolving') {
        const l: CreditLine = {
          id: final.creditLineId,
          institutionId: instId,
          ...s.creditLines.find((x) => x.id === final.creditLineId),
          // Tên hạn mức luôn theo tên thẻ (đổi tên thẻ thì hạn mức đổi theo)
          name: creditLineNameFor(final.name),
          limit: limit ?? 0,
        };
        next.creditLines = [...s.creditLines.filter((x) => x.id !== l.id), l];
        const fs = firstStatement;
        if (!editing && fs.statementDate && fs.dueDate && fs.currentBalance !== undefined) {
          next.statements = [
            ...s.statements,
            {
              id: newId('st'),
              obligationId: final.id,
              statementDate: fs.statementDate,
              dueDate: fs.dueDate,
              statementBalance: fs.statementBalance ?? fs.currentBalance,
              currentBalance: fs.currentBalance,
              capturedAt: today,
            },
          ];
        }
      }
      next.obligations = editing ? s.obligations.map((o) => (o.id === final.id ? final : o)) : [...s.obligations, final];
      return next;
    });
    onClose(final.id);
  };

  // Gợi ý ngày sao kê/đến hạn cho sao kê đầu tiên
  const suggestStatement = () => {
    if (ob.kind !== 'credit_card') return;
    const st = setDay(ob.statementDay <= Number(today.slice(8)) ? monthOf(today) : addMonthsYM(monthOf(today), -1), ob.statementDay);
    const due = generateDueDates(ob.dueRule, st, 1)[0];
    setFirstStatement({ ...firstStatement, statementDate: st, dueDate: due });
  };

  return (
    <Modal
      wide
      title={editing ? `Sửa: ${initial!.name}` : 'Thêm khoản nợ'}
      onClose={() => onClose()}
      footer={
        <>
          <button onClick={() => onClose()}>Huỷ</button>
          <button className="primary" onClick={save}>
            {editing ? 'Lưu thay đổi' : 'Thêm khoản'}
          </button>
        </>
      }
    >
      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <h3>Tổ chức cho vay</h3>
      <div className="form">
        <Field label="Tổ chức">
          <select value={instId} onChange={(e) => setInstId(e.target.value)}>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name || '(tổ chức mới)'}
              </option>
            ))}
          </select>
        </Field>
        {!editing && !newInst && (
          <Field label=" ">
            <button onClick={() => { const n: Institution = { id: newId('inst'), name: '', type: 'bank' }; setNewInst(n); setInstId(n.id); }}>
              + Tổ chức mới
            </button>
          </Field>
        )}
        {newInst && newInst.id === instId && (
          <>
            <Field label="Tên tổ chức">
              <TextInput value={newInst.name} onChange={(name) => setNewInst({ ...newInst, name })} placeholder="Ví dụ: Ngân hàng A" />
            </Field>
            <Field label="Loại">
              <Select value={newInst.type} onChange={(type) => setNewInst({ ...newInst, type })} options={INST_TYPES} />
            </Field>
            <Field label="Bắt đầu từ preset (tuỳ chọn)" wide>
              <select value={presetKey} onChange={(e) => applyPreset(e.target.value)}>
                <option value="">— Không dùng preset —</option>
                {builtinPresets.map((p) => (
                  <option key={p.key} value={p.key}>{p.displayName}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        {preset && preset.obligationTemplates.length > 0 && !editing && (
          <Field label="Mẫu khoản nợ của preset" wide>
            <select defaultValue="" onChange={(e) => applyTemplate(Number(e.target.value))}>
              <option value="" disabled>— Chọn mẫu —</option>
              {preset.obligationTemplates.map((t, i) => (
                <option key={i} value={i}>{t.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <h3>Khoản nợ</h3>
      <div className="form">
        <Field label="Loại">
          {editing ? <span>{KINDS.find((k) => k.value === ob.kind)?.label}</span> : <Select value={ob.kind} onChange={changeKind} options={KINDS} />}
        </Field>
        <Field label="Tên"><TextInput value={ob.name} onChange={(name) => set({ name })} placeholder="Ví dụ: Vay mua xe" /></Field>
        <Field label="Trạng thái">
          <Select
            value={ob.status}
            onChange={(status) => set({ status })}
            options={[
              { value: 'active', label: 'Đang theo dõi' },
              { value: 'paused', label: 'Tạm dừng' },
              { value: 'closed', label: 'Đã đóng / tất toán' },
            ]}
          />
        </Field>
        <Field label="Ghi chú" wide><TextInput value={ob.note} onChange={(note) => set({ note })} /></Field>
      </div>

      {ob.kind === 'installment_loan' && (
        <>
          <div className="form">
            <Field label="Số tiền vay (trên hợp đồng)"><MoneyInput value={ob.principal || undefined} onChange={(v) => set({ principal: v ?? 0 })} /></Field>
            <Field label="Tiền thực nhận" hint="Để trống nếu = số tiền vay − phí trừ trước">
              <MoneyInput value={ob.netDisbursed} onChange={(netDisbursed) => set({ netDisbursed })} />
            </Field>
            <Field label="Ngày giải ngân / mở khoản"><DateInput value={ob.startDate} onChange={(v) => v && set({ startDate: v })} /></Field>
            <Field label="Số kỳ"><IntInput min={1} value={ob.periods} onChange={(periods) => set({ periods })} /></Field>
          </div>
          <InterestModelEditor value={ob.interestModel} onChange={(interestModel) => set({ interestModel })} />
          <DueRuleEditor value={ob.dueRule} onChange={(dueRule) => set({ dueRule })} />
          <Check checked={!!ob.dueDateEstimated} onChange={(dueDateEstimated) => set({ dueDateEstimated })}>
            Ngày đến hạn là tạm tính
          </Check>

          <h3>Phí</h3>
          <Check
            checked={ob.perPeriodFees === undefined && ob.upfrontFees === undefined}
            onChange={(useDefault) =>
              set(
                useDefault
                  ? { perPeriodFees: undefined, upfrontFees: undefined }
                  : { perPeriodFees: structuredClone(inst?.defaults?.perPeriodFee ?? []), upfrontFees: structuredClone(inst?.defaults?.upfrontFees ?? []) },
              )
            }
          >
            Dùng phí mặc định của tổ chức ({(inst?.defaults?.perPeriodFee ?? []).concat(inst?.defaults?.upfrontFees ?? []).map((f) => f.name).join(', ') || 'không có'})
          </Check>
          {(ob.perPeriodFees !== undefined || ob.upfrontFees !== undefined) && (
            <>
              <p className="field-hint">Phí mỗi kỳ</p>
              <FeeListEditor value={ob.perPeriodFees ?? []} onChange={(perPeriodFees) => set({ perPeriodFees })} timings={['per_period']} />
              <p className="field-hint">Phí khi giải ngân</p>
              <FeeListEditor value={ob.upfrontFees ?? []} onChange={(upfrontFees) => set({ upfrontFees })} timings={['upfront_deducted', 'upfront_paid', 'one_time']} />
            </>
          )}

          <h3>Liên kết thẻ / hạn mức</h3>
          <div className="form">
            <Field label="Gắn vào thẻ">
              <select
                value={ob.link ? (ob.link.parentObligationId ?? PICK) : ''}
                onChange={(e) => {
                  if (e.target.value === PICK) return;
                  const parent = cards.find((c) => c.id === e.target.value);
                  set({
                    link: parent
                      ? {
                          parentObligationId: parent.id,
                          creditLineId: 'creditLineId' in parent ? parent.creditLineId : undefined,
                          sharesCreditLimit: ob.link?.sharesCreditLimit ?? true,
                          billedIntoStatement: ob.link?.billedIntoStatement ?? false,
                        }
                      : undefined,
                  });
                }}
              >
                {/* Có liên kết (ví dụ từ mẫu preset) mà chưa chọn thẻ → bắt chọn, không hiện như "độc lập" */}
                {ob.link && !ob.link.parentObligationId && <option value={PICK} disabled>— Chọn thẻ —</option>}
                <option value="">— Khoản vay độc lập —</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            {ob.link && (
              <>
                <Check checked={ob.link.sharesCreditLimit} onChange={(v) => set({ link: { ...ob.link!, sharesCreditLimit: v } })}>
                  Dùng chung hạn mức thẻ
                </Check>
                <Check checked={ob.link.billedIntoStatement} onChange={(v) => set({ link: { ...ob.link!, billedIntoStatement: v } })}>
                  Kỳ trả nằm trong sao kê thẻ (không cộng riêng)
                </Check>
                {ob.link.billedIntoStatement && (
                  <p className="field-hint wide">
                    Kỳ đầu lên sao kê đầu tiên sau ngày chuyển đổi và được trả cùng sao kê đó. Ví dụ chuyển đổi 06/10, sao kê ngày 25 → kỳ
                    1 nằm trong sao kê 25/10, trả cùng hạn thẻ (09/11). Dư nợ hiện tại của thẻ đã gồm kỳ đó; phần gốc các kỳ sau được app tính riêng
                    vào hạn mức.
                  </p>
                )}
              </>
            )}
          </div>

          <h3>Đang trả giữa chừng?</h3>
          <Check
            checked={!!ob.opening}
            onChange={(on) =>
              set({ opening: on ? { asOf: today, periodsPaid: preview ? expectedPaidAt(preview.rows, today) : 0 } : undefined })
            }
          >
            Tôi bắt đầu theo dõi khi đã trả một số kỳ
          </Check>
          {ob.opening && (
            <div className="form">
              <Field label="Tính đến ngày"><DateInput value={ob.opening.asOf} onChange={(asOf) => asOf && set({ opening: { ...ob.opening!, asOf } })} /></Field>
              <Field label="Số kỳ đã trả" hint={preview ? `Theo lịch: ${expectedPaidAt(preview.rows, ob.opening.asOf)} kỳ` : undefined}>
                <IntInput min={0} value={ob.opening.periodsPaid} onChange={(periodsPaid) => set({ opening: { ...ob.opening!, periodsPaid } })} />
              </Field>
              <Field label="Gốc còn lại (nếu biết chính xác)">
                <MoneyInput value={ob.opening.principalRemaining} onChange={(principalRemaining) => set({ opening: { ...ob.opening!, principalRemaining } })} />
              </Field>
            </div>
          )}

          {preview && (
            <>
              <h3>Xem trước bảng kỳ hạn</h3>
              <div className="tiles small">
                <div className="tile"><div className="tile-label">Lãi danh nghĩa/năm</div><div className="tile-value">{fmt.rate(preview.metrics.nominalAPR)}</div></div>
                <div className="tile"><div className="tile-label">Lãi thực tế/năm (APR)</div><div className="tile-value">{fmt.rate(preview.metrics.effectiveAPR)}</div></div>
                <div className="tile"><div className="tile-label">Tổng phải trả</div><div className="tile-value">{fmt.money(preview.metrics.totalPaid)}</div></div>
                <div className="tile"><div className="tile-label">Tổng chi phí vay</div><div className="tile-value">{fmt.money(preview.metrics.totalCost)}</div></div>
              </div>
              <ScheduleTable rows={preview.rows} />
            </>
          )}
        </>
      )}

      {(ob.kind === 'credit_card' || ob.kind === 'revolving') && (
        <>
          <div className="form">
            <Field label="Hạn mức"><MoneyInput value={limit} onChange={setLimit} /></Field>
            {ob.kind === 'credit_card' && (
              <>
                <Field label="4 số cuối (tuỳ chọn)" hint="Không bao giờ nhập số thẻ đầy đủ">
                  <input maxLength={4} inputMode="numeric" value={ob.last4 ?? ''} onChange={(e) => set({ last4: e.target.value.replace(/\D/g, '') || undefined })} />
                </Field>
                <Field label="Ngày sao kê">
                  <IntInput
                    min={1}
                    max={31}
                    value={ob.statementDay}
                    onChange={(statementDay) =>
                      set({
                        statementDay,
                        dueRule: 'statementDay' in ob.dueRule ? { ...ob.dueRule, statementDay } : ob.dueRule,
                      })
                    }
                  />
                </Field>
                <Field label="Lãi suất thẻ/năm"><PercentInput value={ob.annualRate} onChange={(annualRate) => set({ annualRate })} /></Field>
                <Field label="Cách trả thẻ">
                  <Select<PolicyChoice>
                    value={policyChoice}
                    onChange={(c) =>
                      set({
                        paymentPolicy:
                          c === 'inherit' ? undefined : c === 'fixed' ? { type: 'fixed', amount: 0 } : (c as CardPaymentPolicy),
                      })
                    }
                    options={[
                      { value: 'inherit', label: 'Theo cài đặt chung' },
                      { value: 'current_balance', label: 'Trả hết dư nợ hiện tại' },
                      { value: 'statement_balance', label: 'Trả đúng dư nợ sao kê' },
                      { value: 'minimum', label: 'Trả tối thiểu (phát sinh lãi)' },
                      { value: 'fixed', label: 'Số tiền cố định' },
                    ]}
                  />
                </Field>
                {typeof ob.paymentPolicy === 'object' && (
                  <Field label="Số tiền cố định mỗi kỳ">
                    <MoneyInput value={ob.paymentPolicy.amount} onChange={(v) => set({ paymentPolicy: { type: 'fixed', amount: v ?? 0 } })} />
                  </Field>
                )}
                {ob.paymentPolicy === 'minimum' && (
                  <>
                    <Field label="Tối thiểu % sao kê">
                      <PercentInput
                        value={ob.minimumPayment?.percentOfStatement ?? 0.05}
                        onChange={(v) => set({ minimumPayment: { includeInstallmentsInFull: true, ...ob.minimumPayment, percentOfStatement: v ?? 0 } })}
                      />
                    </Field>
                    <Field label="Tối thiểu tuyệt đối">
                      <MoneyInput
                        value={ob.minimumPayment?.floor}
                        onChange={(floor) => set({ minimumPayment: { percentOfStatement: 0.05, includeInstallmentsInFull: true, ...ob.minimumPayment, floor } })}
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            {ob.kind === 'revolving' && (
              <Field label="Lãi suất/năm"><PercentInput value={ob.annualRate} onChange={(v) => set({ annualRate: v ?? 0 })} /></Field>
            )}
          </div>
          <DueRuleEditor value={ob.dueRule} onChange={(dueRule) => set({ dueRule })} />
          {!editing && ob.kind === 'credit_card' && (
            <>
              <h3>
                Sao kê gần nhất (tuỳ chọn){' '}
                <button className="small" onClick={suggestStatement}>Gợi ý ngày</button>
              </h3>
              <div className="form">
                <Field label="Ngày sao kê"><DateInput value={firstStatement.statementDate} onChange={(statementDate) => setFirstStatement({ ...firstStatement, statementDate })} /></Field>
                <Field label="Ngày đến hạn"><DateInput value={firstStatement.dueDate} onChange={(dueDate) => setFirstStatement({ ...firstStatement, dueDate })} /></Field>
                <Field label="Dư nợ sao kê"><MoneyInput value={firstStatement.statementBalance} onChange={(statementBalance) => setFirstStatement({ ...firstStatement, statementBalance })} /></Field>
                <Field label="Dư nợ hiện tại"><MoneyInput value={firstStatement.currentBalance} onChange={(currentBalance) => setFirstStatement({ ...firstStatement, currentBalance })} /></Field>
              </div>
            </>
          )}
        </>
      )}

      {ob.kind === 'custom' && (
        <>
          <h3>Lịch trả</h3>
          <table className="cards-mobile">
            <tbody>
              {ob.schedule.map((e, i) => (
                <tr key={i}>
                  <td><DateInput value={e.dueDate} onChange={(d) => d && set({ schedule: ob.schedule.map((x, j) => (j === i ? { ...x, dueDate: d } : x)) })} /></td>
                  <td><MoneyInput value={e.amount} onChange={(v) => set({ schedule: ob.schedule.map((x, j) => (j === i ? { ...x, amount: v ?? 0 } : x)) })} /></td>
                  <td><TextInput value={e.note} placeholder="Ghi chú" onChange={(note) => set({ schedule: ob.schedule.map((x, j) => (j === i ? { ...x, note } : x)) })} /></td>
                  <td><button className="ghost small" onClick={() => set({ schedule: ob.schedule.filter((_, j) => j !== i) })}>Xoá</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="small" onClick={() => set({ schedule: [...ob.schedule, { dueDate: today, amount: 0 }] })}>
            + Thêm ngày trả
          </button>
        </>
      )}
    </Modal>
  );
}

export function ScheduleTable({ rows, paid }: { rows: ReturnType<typeof buildSchedule>; paid?: (n: number) => { paid: boolean; paidAmount: number } }) {
  const fmt = useFmt();
  return (
    <div className="scroll schedule">
      <table>
        <thead>
          <tr>
            <th>Kỳ</th>
            <th>Ngày</th>
            <th className="r">Gốc</th>
            <th className="r">Lãi</th>
            <th className="r">Phí</th>
            <th className="r">Tổng</th>
            <th className="r">Gốc còn lại</th>
            {paid && <th>Đã trả</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = paid?.(r.n);
            return (
              <tr key={r.n} className={p?.paid ? 'done' : undefined}>
                <td>{r.n}</td>
                <td>{fmt.date(r.dueDate)}</td>
                <td className="r">{fmt.money(r.principal)}</td>
                <td className="r">{fmt.money(r.interest)}</td>
                <td className="r">{fmt.money(r.fees)}</td>
                <td className="r">{fmt.money(r.total)}</td>
                <td className="r">{fmt.money(r.principalRemainingAfter)}</td>
                {paid && <td>{p?.paid ? '✓' : p && p.paidAmount > 0 ? fmt.money(p.paidAmount) : ''}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
