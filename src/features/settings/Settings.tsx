import { useState } from 'react';
import { Check, Field, IntInput, PercentInput, Select, TextInput } from '../../components/inputs';
import { download, downloadJson, paymentsCsv, pickFile, schedulesCsv, slug } from '../../data/io';
import { appendixA } from '../../data/examples/appendixA';
import { newProfileState } from '../../domain/defaults';
import type { CardPaymentPolicy, LoanDebtMeasure, ProfileSettings, WeekendShift } from '../../domain/types';
import { useEngine, useProfile, useUpdate } from '../../state/hooks';
import { readLegacyV1, useStore } from '../../state/store';
import { cloneProfile, importProfileJson } from './importExport';

const CURRENCIES = [
  { value: 'VND', label: 'VND — Việt Nam đồng' },
  { value: 'USD', label: 'USD — Đô la Mỹ' },
  { value: 'EUR', label: 'EUR — Euro' },
];
const LOCALES = [
  { value: 'vi-VN', label: 'Tiếng Việt (vi-VN)' },
  { value: 'en-US', label: 'English (en-US)' },
];

export function Settings() {
  const state = useProfile();
  const engine = useEngine();
  const update = useUpdate();
  const store = useStore();
  const [message, setMessage] = useState<string>();
  const s = state.profile.settings;
  const setS = (p: Partial<ProfileSettings>) => update((x) => ({ ...x, profile: { ...x.profile, settings: { ...x.profile.settings, ...p } } }));
  const setP = (p: Partial<typeof state.profile>) => update((x) => ({ ...x, profile: { ...x.profile, ...p } }));
  const policy = typeof s.defaultCardPaymentPolicy === 'object' ? 'current_balance' : s.defaultCardPaymentPolicy;
  const legacy = readLegacyV1();

  const run = async (f: () => Promise<string | void>) => {
    try {
      const m = await f();
      if (m) setMessage(m);
    } catch (e) {
      setMessage(`Lỗi: ${(e as Error).message}`);
    }
  };

  return (
    <div className="stack">
      <section className="panel">
        <h2>Profile</h2>
        <div className="form">
          <Field label="Tên profile"><TextInput value={state.profile.name} onChange={(name) => setP({ name })} /></Field>
          <Field label="Tiền tệ" hint="Đổi tiền tệ không quy đổi số tiền đã nhập">
            <Select value={state.profile.currency} onChange={(currency) => setP({ currency })} options={CURRENCIES} />
          </Field>
          <Field label="Định dạng"><Select value={state.profile.locale} onChange={(locale) => setP({ locale })} options={LOCALES} /></Field>
        </div>
        <h3>Các profile trên máy này</h3>
        <table>
          <tbody>
            {store.profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.name} {p.id === state.profile.id && <span className="badge blue">đang mở</span>}</td>
                <td className="muted small-text">{p.currency}</td>
                <td className="nowrap">
                  {p.id !== state.profile.id && <button className="small" onClick={() => store.switchProfile(p.id)}>Mở</button>}{' '}
                  <button
                    className="small ghost"
                    onClick={() => confirm(`Xoá profile "${p.name}" và toàn bộ dữ liệu của nó? (Có sao lưu trong trình duyệt)`) && store.deleteProfile(p.id)}
                  >
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
            onClick={() => {
              const name = prompt('Tên profile mới:', 'Profile mới');
              if (name) run(() => store.addProfile(newProfileState({ name, viewMonth: state.viewMonth, currency: state.profile.currency, locale: state.profile.locale })));
            }}
          >
            + Profile trống
          </button>
          <button className="small" onClick={() => run(() => store.addProfile(cloneProfile(structuredClone(appendixA), 'Ví dụ (Phụ lục A)')))}>
            + Profile ví dụ
          </button>
          <button className="small" onClick={() => run(() => store.addProfile(cloneProfile(structuredClone(state))))}>Nhân bản profile này</button>
        </div>
      </section>

      <section className="panel">
        <h2>Tính toán & cảnh báo</h2>
        <div className="form">
          <Field label="Cách trả thẻ mặc định">
            <Select<Exclude<CardPaymentPolicy, object>>
              value={policy}
              onChange={(defaultCardPaymentPolicy) => setS({ defaultCardPaymentPolicy })}
              options={[
                { value: 'current_balance', label: 'Trả hết dư nợ hiện tại (khuyến nghị)' },
                { value: 'statement_balance', label: 'Trả đúng dư nợ sao kê' },
                { value: 'minimum', label: 'Trả tối thiểu (phát sinh lãi)' },
              ]}
            />
          </Field>
          <Field label={'Báo "sắp đến hạn" trước (ngày)'}>
            <IntInput min={0} max={31} value={s.dueSoonThresholdDays} onChange={(dueSoonThresholdDays) => setS({ dueSoonThresholdDays })} />
          </Field>
          <Field label="Cảnh báo dùng hạn mức trên"><PercentInput value={s.utilizationWarning} onChange={(v) => setS({ utilizationWarning: v ?? 0.3 })} /></Field>
          <Field label="Cảnh báo lãi thực tế trên (/năm)"><PercentInput value={s.highAprThreshold} onChange={(v) => setS({ highAprThreshold: v ?? 0.4 })} /></Field>
          <Field label="Ngày đến hạn rơi vào cuối tuần / lễ">
            <Select<WeekendShift>
              value={s.weekendShift}
              onChange={(weekendShift) => setS({ weekendShift })}
              options={[
                { value: 'none', label: 'Giữ nguyên' },
                { value: 'next_business_day', label: 'Dời sang ngày làm việc sau' },
                { value: 'previous_business_day', label: 'Dời về ngày làm việc trước' },
              ]}
            />
          </Field>
          <Field label="Dư nợ khoản vay tính theo">
            <Select<LoanDebtMeasure>
              value={s.loanDebtMeasure}
              onChange={(loanDebtMeasure) => setS({ loanDebtMeasure })}
              options={[
                { value: 'auto', label: 'Tự động: vay trên hạn mức thẻ = gốc; vay độc lập = tổng còn phải trả' },
                { value: 'principal', label: 'Luôn là gốc còn lại' },
                { value: 'remaining_payments', label: 'Luôn là tổng còn phải trả (gốc + lãi + phí)' },
              ]}
            />
          </Field>
          <Field label="Ngày nghỉ lễ (mỗi dòng một ngày YYYY-MM-DD)" wide>
            <textarea
              rows={3}
              defaultValue={s.holidays.join('\n')}
              onBlur={(e) => setS({ holidays: e.target.value.split(/\s+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) })}
            />
          </Field>
        </div>
        <Check checked={s.groupByDate} onChange={(groupByDate) => setS({ groupByDate })}>Gộp các khoản cùng tổ chức, cùng ngày trên Dashboard</Check>
        <Check checked={store.privacy} onChange={store.setPrivacy}>Chế độ riêng tư — ẩn số tiền (•••) khi chia sẻ màn hình</Check>
      </section>

      <section className="panel">
        <h2>Xuất / nhập</h2>
        <p className="muted small-text">Dữ liệu chỉ nằm trong trình duyệt này (IndexedDB). Hãy xuất JSON định kỳ để sao lưu.</p>
        <div className="toolbar">
          <button onClick={() => downloadJson(`no-${slug(state.profile.name)}-${state.viewMonth}.json`, state)}>Xuất JSON</button>
          <button onClick={() => download(`lich-tra-${slug(state.profile.name)}.csv`, schedulesCsv(engine), 'text/csv')}>Xuất CSV lịch trả</button>
          <button onClick={() => download(`thanh-toan-${slug(state.profile.name)}.csv`, paymentsCsv(state), 'text/csv')}>Xuất CSV thanh toán</button>
          <button
            onClick={() =>
              run(async () => {
                const f = await pickFile();
                return f ? importProfileJson(await f.text()) : undefined;
              })
            }
          >
            Nhập JSON…
          </button>
          {legacy !== null && (
            <button onClick={() => run(() => importProfileJson(JSON.stringify(legacy)))}>Nhập dữ liệu từ app v1</button>
          )}
        </div>
        {message && <p className="notice">{message}</p>}
      </section>
    </div>
  );
}
