import { useEffect, useState, type ReactNode } from 'react';
import { minorUnitDigits } from '../domain/money';
import { useProfile } from '../state/hooks';

/** Ô số dạng text: giữ chuỗi người dùng đang gõ, chỉ đồng bộ từ props khi không focus. */
function NumberText(props: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  toText: (v: number) => string;
  parse: (t: string) => number | undefined;
  placeholder?: string;
  className?: string;
  inputMode: 'numeric' | 'decimal';
  suffix?: string;
}) {
  const { value, onChange, toText, parse } = props;
  const [text, setText] = useState(value === undefined ? '' : toText(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === undefined ? '' : toText(value));
  }, [value, focused, toText]);
  const input = (
    <input
      className={`num ${props.className ?? ''}`}
      inputMode={props.inputMode}
      placeholder={props.placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.trim() === '' ? undefined : parse(e.target.value));
      }}
    />
  );
  return props.suffix ? (
    <span className="suffix">
      {input}
      <span>{props.suffix}</span>
    </span>
  ) : (
    input
  );
}

/** Tiền theo đơn vị nhỏ nhất của tiền tệ profile (VND: đồng, USD: cent). */
export function MoneyInput(props: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string }) {
  const { currency, locale } = useProfile().profile;
  const digits = minorUnitDigits(currency);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
  const dec = nf.formatToParts(1.1).find((p) => p.type === 'decimal')?.value ?? '.';
  return (
    <NumberText
      {...props}
      inputMode={digits ? 'decimal' : 'numeric'}
      toText={(v) => nf.format(v / 10 ** digits)}
      parse={(t) => {
        const clean = t.split(dec).map((s) => s.replace(/\D/g, ''));
        const n = Number(`${clean[0] || '0'}.${(clean[1] ?? '').slice(0, digits)}`);
        return Number.isFinite(n) ? Math.round(n * 10 ** digits) : undefined;
      }}
    />
  );
}

/** Lưu dạng phân số (0.012), nhập dạng % (1,2). */
export function PercentInput(props: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string }) {
  return (
    <NumberText
      {...props}
      className="pct"
      inputMode="decimal"
      suffix="%"
      toText={(v) => String(+(v * 100).toFixed(6)).replace('.', ',')}
      parse={(t) => {
        const n = Number(t.replace(',', '.'));
        return Number.isFinite(n) ? n / 100 : undefined;
      }}
    />
  );
}

export function IntInput(props: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      className="num small"
      type="number"
      min={props.min}
      max={props.max}
      value={props.value ?? ''}
      onChange={(e) => props.onChange(Math.floor(Number(e.target.value) || 0))}
    />
  );
}

export const DateInput = (props: { value: string | undefined; onChange: (v: string | undefined) => void; type?: 'date' | 'month' }) => (
  <input type={props.type ?? 'date'} value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || undefined)} />
);

export const TextInput = (props: { value: string | undefined; onChange: (v: string) => void; placeholder?: string }) => (
  <input value={props.value ?? ''} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
);

export function Select<T extends string>(props: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check(props: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} /> {props.children}
    </label>
  );
}

/** <label> bao quanh ô nhập để nhãn gắn với ô (trình đọc màn hình, getByLabel trong E2E). */
export function Field(props: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${props.wide ? 'wide' : ''}`}>
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}
