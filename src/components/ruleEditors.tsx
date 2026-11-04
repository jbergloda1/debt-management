import { newId } from '../domain/defaults';
import { describeDueRule, describeInterestModel, listDueDateStrategies, listInterestModels } from '../domain/rules';
import type { DueDateRule, FeeRule, InterestModel } from '../domain/types';
import { DateInput, Field, IntInput, MoneyInput, PercentInput, Select, TextInput } from './inputs';

const DEFAULT_RULES: Record<DueDateRule['type'], DueDateRule> = {
  fixed_day: { type: 'fixed_day', day: 15, cutoffDay: 15, offsetIfOnOrBeforeCutoff: 1, offsetIfAfterCutoff: 2 },
  same_day_as_start: { type: 'same_day_as_start', offsetMonths: 1 },
  statement_offset: { type: 'statement_offset', statementDay: 10, daysAfterStatement: 25 },
  statement_fixed_due: { type: 'statement_fixed_due', statementDay: 25, dueDay: 10 },
  explicit: { type: 'explicit', dates: [] },
  every_n_days: { type: 'every_n_days', n: 30, anchor: new Date().toISOString().slice(0, 10) },
};

export function DueRuleEditor({ value, onChange }: { value: DueDateRule; onChange: (r: DueDateRule) => void }) {
  const set = (p: Partial<DueDateRule>) => onChange({ ...value, ...p } as DueDateRule);
  return (
    <div className="subform">
      <Field label="Quy tắc ngày trả" wide>
        <Select
          value={value.type}
          onChange={(t) => onChange(structuredClone(DEFAULT_RULES[t]))}
          options={listDueDateStrategies().map((s) => ({ value: s.type as DueDateRule['type'], label: s.label }))}
        />
      </Field>
      {value.type === 'fixed_day' && (
        <>
          <Field label="Ngày trả"><IntInput min={1} max={31} value={value.day} onChange={(day) => set({ day })} /></Field>
          <Field label="Ngày cutoff"><IntInput min={1} max={31} value={value.cutoffDay} onChange={(cutoffDay) => set({ cutoffDay })} /></Field>
          <Field label="Mở ≤ cutoff: kỳ đầu sau (tháng)">
            <IntInput min={0} value={value.offsetIfOnOrBeforeCutoff} onChange={(v) => set({ offsetIfOnOrBeforeCutoff: v })} />
          </Field>
          <Field label="Mở > cutoff: kỳ đầu sau (tháng)">
            <IntInput min={0} value={value.offsetIfAfterCutoff} onChange={(v) => set({ offsetIfAfterCutoff: v })} />
          </Field>
        </>
      )}
      {value.type === 'same_day_as_start' && (
        <Field label="Kỳ đầu sau (tháng)">
          <IntInput min={0} value={value.offsetMonths ?? 1} onChange={(offsetMonths) => set({ offsetMonths })} />
        </Field>
      )}
      {value.type === 'statement_offset' && (
        <>
          <Field label="Ngày sao kê"><IntInput min={1} max={31} value={value.statementDay} onChange={(statementDay) => set({ statementDay })} /></Field>
          <Field label="Đến hạn sau (ngày)">
            <IntInput min={0} value={value.daysAfterStatement} onChange={(daysAfterStatement) => set({ daysAfterStatement })} />
          </Field>
        </>
      )}
      {value.type === 'statement_fixed_due' && (
        <>
          <Field label="Ngày sao kê"><IntInput min={1} max={31} value={value.statementDay} onChange={(statementDay) => set({ statementDay })} /></Field>
          <Field label="Ngày đến hạn"><IntInput min={1} max={31} value={value.dueDay} onChange={(dueDay) => set({ dueDay })} /></Field>
        </>
      )}
      {value.type === 'every_n_days' && (
        <>
          <Field label="Mỗi (ngày)"><IntInput min={1} value={value.n} onChange={(n) => set({ n })} /></Field>
          <Field label="Mốc"><DateInput value={value.anchor} onChange={(anchor) => anchor && set({ anchor })} /></Field>
        </>
      )}
      {value.type === 'explicit' && (
        <Field label="Các ngày (mỗi dòng một ngày YYYY-MM-DD)" wide>
          <textarea
            rows={4}
            value={value.dates.join('\n')}
            onChange={(e) => set({ dates: e.target.value.split(/\s+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) })}
          />
        </Field>
      )}
      <p className="field-hint wide">{safe(() => describeDueRule(value))}</p>
    </div>
  );
}

const DEFAULT_MODELS: Record<InterestModel['type'], InterestModel> = {
  flat_monthly: { type: 'flat_monthly', monthlyRate: 0.012 },
  reducing_balance: { type: 'reducing_balance', annualRate: 0.3 },
  reducing_equal_principal: { type: 'reducing_equal_principal', annualRate: 0.3 },
  fixed_installment: { type: 'fixed_installment', installment: 0 },
  zero_interest: { type: 'zero_interest' },
  custom_schedule: { type: 'custom_schedule', rows: [] },
};

export function InterestModelEditor({ value, onChange }: { value: InterestModel; onChange: (m: InterestModel) => void }) {
  return (
    <div className="subform">
      <Field label="Cách tính lãi" wide>
        <Select
          value={value.type}
          onChange={(t) => onChange(structuredClone(DEFAULT_MODELS[t]))}
          options={listInterestModels().map((m) => ({ value: m.type as InterestModel['type'], label: m.label }))}
        />
      </Field>
      {value.type === 'flat_monthly' && (
        <Field label="Lãi/phí mỗi tháng (trên gốc ban đầu)">
          <PercentInput value={value.monthlyRate} onChange={(v) => onChange({ ...value, monthlyRate: v ?? 0 })} />
        </Field>
      )}
      {(value.type === 'reducing_balance' || value.type === 'reducing_equal_principal') && (
        <Field label="Lãi suất năm">
          <PercentInput value={value.annualRate} onChange={(v) => onChange({ ...value, annualRate: v ?? 0 })} />
        </Field>
      )}
      {value.type === 'fixed_installment' && (
        <Field label="Số tiền mỗi kỳ (chưa gồm phí)" hint="App tự suy lãi suất bằng RATE()">
          <MoneyInput value={value.installment} onChange={(v) => onChange({ ...value, installment: v ?? 0 })} />
        </Field>
      )}
      {value.type === 'custom_schedule' && (
        <Field label="Mỗi dòng: gốc lãi (số nguyên, cách nhau bởi dấu cách)" wide>
          <textarea
            rows={5}
            defaultValue={value.rows.map((r) => `${r.principal} ${r.interest}`).join('\n')}
            onChange={(e) =>
              onChange({
                ...value,
                rows: e.target.value
                  .split('\n')
                  .map((l) => l.trim().split(/\s+/).map(Number))
                  .filter((p) => p.length >= 1 && p.every(Number.isFinite) && p[0] >= 0)
                  .map(([principal, interest = 0]) => ({ principal, interest })),
              })
            }
          />
        </Field>
      )}
      <p className="field-hint wide">{safe(() => describeInterestModel(value))}</p>
    </div>
  );
}

const TIMING: { value: FeeRule['timing']; label: string }[] = [
  { value: 'per_period', label: 'Mỗi kỳ' },
  { value: 'upfront_deducted', label: 'Trừ khi giải ngân' },
  { value: 'upfront_paid', label: 'Trả riêng khi giải ngân' },
  { value: 'one_time', label: 'Một lần' },
];

const AMOUNT_TYPES = [
  { value: 'fixed', label: 'Số tiền cố định' },
  { value: 'percent_of_principal', label: '% gốc vay' },
  { value: 'percent_of_installment', label: '% số tiền kỳ' },
] as const;

export function FeeListEditor(props: { value: FeeRule[]; onChange: (f: FeeRule[]) => void; timings?: FeeRule['timing'][] }) {
  const { value, onChange } = props;
  const timings = TIMING.filter((t) => !props.timings || props.timings.includes(t.value));
  const patch = (i: number, p: Partial<FeeRule>) => onChange(value.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div className="fees">
      {value.map((f, i) => (
        <div key={f.id} className="fee-row">
          <TextInput value={f.name} onChange={(name) => patch(i, { name })} placeholder="Tên phí" />
          <Select value={f.timing} onChange={(timing) => patch(i, { timing })} options={timings} />
          <Select
            value={f.amount.type}
            onChange={(t) =>
              patch(i, { amount: t === 'fixed' ? { type: 'fixed', value: 0 } : { type: t, rate: 0 } })
            }
            options={[...AMOUNT_TYPES]}
          />
          {f.amount.type === 'fixed' ? (
            <MoneyInput value={f.amount.value} onChange={(v) => patch(i, { amount: { type: 'fixed', value: v ?? 0 } })} />
          ) : (
            <PercentInput
              value={f.amount.rate}
              onChange={(v) => patch(i, { amount: { type: (f.amount as { type: 'percent_of_principal' }).type, rate: v ?? 0 } })}
            />
          )}
          <button className="ghost small" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Xoá
          </button>
        </div>
      ))}
      <button
        className="small"
        onClick={() =>
          onChange([...value, { id: newId('fee'), name: 'Phí', timing: timings[0].value, amount: { type: 'fixed', value: 0 } }])
        }
      >
        + Thêm phí
      </button>
    </div>
  );
}

function safe(f: () => string) {
  try {
    return f();
  } catch {
    return '';
  }
}
