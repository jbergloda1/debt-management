import { useState } from 'react';
import { Check, Field, IntInput, Select, TextInput } from '../../components/inputs';
import { DueRuleEditor, FeeListEditor, InterestModelEditor } from '../../components/ruleEditors';
import { Modal } from '../../components/ui';
import { builtinPresets, institutionFromPreset, isPreset, presetFromInstitution } from '../../data/presets';
import { downloadJson, pickFile, slug } from '../../data/io';
import { newId } from '../../domain/defaults';
import { describeDueRule, describeInterestModel } from '../../domain/rules';
import type { Institution, InstitutionType, WeekendShift } from '../../domain/types';
import { useProfile, useUpdate } from '../../state/hooks';
import { useStore } from '../../state/store';

const TYPES: { value: InstitutionType; label: string }[] = [
  { value: 'bank', label: 'Ngân hàng' },
  { value: 'finance_company', label: 'Công ty tài chính' },
  { value: 'bnpl', label: 'Ví trả sau / BNPL' },
  { value: 'individual', label: 'Cá nhân' },
  { value: 'other', label: 'Khác' },
];

export function Institutions() {
  const state = useProfile();
  const update = useUpdate();
  const setNotice = useStore((s) => s.setNotice);
  const [editing, setEditing] = useState<Institution | null>(null);

  const used = (id: string) => state.obligations.some((o) => o.institutionId === id) || state.creditLines.some((l) => l.institutionId === id);
  const addFromPreset = (key: string) => {
    const p = builtinPresets.find((x) => x.key === key);
    if (p) setEditing(institutionFromPreset(p));
  };

  const importPreset = async () => {
    const f = await pickFile();
    if (!f) return;
    try {
      const p = JSON.parse(await f.text());
      if (!isPreset(p)) throw new Error('File không phải preset (cần key, displayName, institution, obligationTemplates)');
      setEditing(institutionFromPreset(p));
    } catch (e) {
      setNotice(`Không nhập được preset: ${(e as Error).message}`);
    }
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Tổ chức cho vay</h2>
          <div className="toolbar">
            <button className="primary" onClick={() => setEditing({ id: newId('inst'), name: '', type: 'bank' })}>+ Tổ chức mới</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Tên</th><th>Loại</th><th>Mặc định</th><th></th></tr>
          </thead>
          <tbody>
            {state.institutions.map((i) => (
              <tr key={i.id}>
                <td>{i.name}{i.presetKey && <div className="note">preset: {i.presetKey}</div>}</td>
                <td>{TYPES.find((t) => t.value === i.type)?.label}</td>
                <td className="small-text muted">{summarize(i)}</td>
                <td className="nowrap">
                  <button className="small" onClick={() => setEditing(structuredClone(i))}>Sửa</button>{' '}
                  <button className="small" onClick={() => downloadJson(`preset-${slug(i.name)}.json`, presetFromInstitution(i))}>Xuất preset</button>{' '}
                  <button
                    className="small ghost"
                    disabled={used(i.id)}
                    title={used(i.id) ? 'Đang có khoản nợ thuộc tổ chức này' : undefined}
                    onClick={() => confirm(`Xoá ${i.name}?`) && update((s) => ({ ...s, institutions: s.institutions.filter((x) => x.id !== i.id) }))}
                  >
                    Xoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Preset</h2>
        <p className="muted small-text">
          Preset là file JSON mô tả quy tắc mặc định của một loại tổ chức (ngày trả, cách tính lãi, phí). Tạo tổ chức từ preset rồi sửa
          mọi tham số. Preset không bao giờ tự thay đổi khoản đã tạo. Xuất preset không kèm số tiền hay dữ liệu cá nhân.
        </p>
        <table>
          <tbody>
            {builtinPresets.map((p) => (
              <tr key={p.key}>
                <td>
                  <b>{p.displayName}</b>
                  <div className="note">{p.obligationTemplates.map((t) => t.label).join(' · ')}</div>
                  {p.source && <div className="note">{p.source}</div>}
                </td>
                <td><button className="small" onClick={() => addFromPreset(p.key)}>Tạo tổ chức</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="small" onClick={importPreset}>Nhập preset từ file…</button>
      </section>

      {editing && (
        <InstitutionModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(inst) =>
            update((s) => ({
              ...s,
              institutions: s.institutions.some((x) => x.id === inst.id)
                ? s.institutions.map((x) => (x.id === inst.id ? inst : x))
                : [...s.institutions, inst],
            }))
          }
        />
      )}
    </div>
  );
}

function summarize(i: Institution): string {
  const d = i.defaults ?? {};
  const parts: string[] = [];
  try {
    if (d.dueDateRule) parts.push(describeDueRule(d.dueDateRule));
    if (d.interestModel) parts.push(describeInterestModel(d.interestModel));
  } catch {
    /* rule lạ */
  }
  for (const f of [...(d.perPeriodFee ?? []), ...(d.upfrontFees ?? [])]) parts.push(f.name);
  if (d.weekendShift && d.weekendShift !== 'none') parts.push('dời ngày nghỉ');
  return parts.join(' · ') || '—';
}

function InstitutionModal(props: { initial: Institution; onClose: () => void; onSave: (i: Institution) => void }) {
  const [inst, setInst] = useState(props.initial);
  const d = inst.defaults ?? {};
  const setD = (p: Partial<NonNullable<Institution['defaults']>>) => setInst({ ...inst, defaults: { ...d, ...p } });
  return (
    <Modal
      wide
      title={inst.name || 'Tổ chức mới'}
      onClose={props.onClose}
      footer={
        <>
          <button onClick={props.onClose}>Huỷ</button>
          <button className="primary" disabled={!inst.name.trim()} onClick={() => { props.onSave(inst); props.onClose(); }}>Lưu</button>
        </>
      }
    >
      <div className="form">
        <Field label="Tên"><TextInput value={inst.name} onChange={(name) => setInst({ ...inst, name })} /></Field>
        <Field label="Loại"><Select value={inst.type} onChange={(type) => setInst({ ...inst, type })} options={TYPES} /></Field>
        <Field label="Ngày đến hạn rơi vào ngày nghỉ">
          <Select<WeekendShift | 'inherit'>
            value={d.weekendShift ?? 'inherit'}
            onChange={(v) => setD({ weekendShift: v === 'inherit' ? undefined : v })}
            options={[
              { value: 'inherit', label: 'Theo cài đặt chung' },
              { value: 'none', label: 'Giữ nguyên' },
              { value: 'next_business_day', label: 'Dời sang ngày làm việc sau' },
              { value: 'previous_business_day', label: 'Dời về ngày làm việc trước' },
            ]}
          />
        </Field>
        <Field label="Làm tròn tới (đơn vị)" hint="1 = đồng; 1000 = nghìn">
          <IntInput
            min={1}
            value={d.rounding?.unit ?? 1}
            onChange={(unit) => setD({ rounding: { mode: d.rounding?.mode ?? 'round', remainderTo: d.rounding?.remainderTo ?? 'last', unit: Math.max(1, unit) } })}
          />
        </Field>
        <Field label="Ghi chú" wide><TextInput value={inst.note} onChange={(note) => setInst({ ...inst, note })} /></Field>
      </div>
      <h3>Mặc định khi thêm khoản vay</h3>
      <Check checked={!!d.dueDateRule} onChange={(on) => setD({ dueDateRule: on ? { type: 'same_day_as_start', offsetMonths: 1 } : undefined })}>
        Quy tắc ngày trả mặc định
      </Check>
      {d.dueDateRule && <DueRuleEditor value={d.dueDateRule} onChange={(dueDateRule) => setD({ dueDateRule })} />}
      <Check checked={!!d.interestModel} onChange={(on) => setD({ interestModel: on ? { type: 'flat_monthly', monthlyRate: 0.012 } : undefined })}>
        Cách tính lãi mặc định
      </Check>
      {d.interestModel && <InterestModelEditor value={d.interestModel} onChange={(interestModel) => setD({ interestModel })} />}
      <h3>Phí mặc định</h3>
      <p className="field-hint">Mỗi kỳ (ví dụ phí thu hộ)</p>
      <FeeListEditor value={d.perPeriodFee ?? []} onChange={(perPeriodFee) => setD({ perPeriodFee })} timings={['per_period']} />
      <p className="field-hint">Khi giải ngân (ví dụ bảo hiểm bị trừ)</p>
      <FeeListEditor value={d.upfrontFees ?? []} onChange={(upfrontFees) => setD({ upfrontFees })} timings={['upfront_deducted', 'upfront_paid', 'one_time']} />
    </Modal>
  );
}
