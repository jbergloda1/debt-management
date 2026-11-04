import { useState } from 'react';
import { Field, Select, TextInput } from '../../components/inputs';
import { appendixA } from '../../data/examples/appendixA';
import { pickFile } from '../../data/io';
import { monthOf } from '../../domain/dates';
import { newProfileState } from '../../domain/defaults';
import type { CardPaymentPolicy } from '../../domain/types';
import { readLegacyV1, useStore } from '../../state/store';
import { cloneProfile, importProfileJson } from '../settings/importExport';

export function Onboarding() {
  const store = useStore();
  const [name, setName] = useState('Của tôi');
  const [currency, setCurrency] = useState('VND');
  const [policy, setPolicy] = useState<Exclude<CardPaymentPolicy, object>>('current_balance');
  const [error, setError] = useState<string>();
  const legacy = readLegacyV1();

  const create = () =>
    store.addProfile(
      newProfileState({
        name: name.trim() || 'Của tôi',
        currency,
        locale: currency === 'VND' ? 'vi-VN' : 'en-US',
        viewMonth: monthOf(store.today),
        settings: { defaultCardPaymentPolicy: policy },
      }),
    );

  const tryImport = async (text: string) => {
    try {
      await importProfileJson(text);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="onboarding">
      <h1>Quản lý nợ</h1>
      <p className="muted">
        Theo dõi thẻ tín dụng, vay trả góp và mọi khoản nợ: tháng này phải trả bao nhiêu, khi nào hết nợ, lãi thực tế bao nhiêu. Dữ liệu
        chỉ lưu trên thiết bị này.
      </p>

      {legacy !== null && (
        <section className="panel highlight">
          <h2>Tìm thấy dữ liệu của app v1</h2>
          <p>Chuyển toàn bộ thẻ, khoản vay, số kỳ đã trả và tiền hiện có sang phiên bản mới.</p>
          <button className="primary" onClick={() => tryImport(JSON.stringify(legacy))}>Chuyển dữ liệu v1</button>
        </section>
      )}

      <section className="panel">
        <h2>Tạo profile mới</h2>
        <div className="form">
          <Field label="Tên"><TextInput value={name} onChange={setName} /></Field>
          <Field label="Tiền tệ">
            <Select
              value={currency}
              onChange={setCurrency}
              options={[
                { value: 'VND', label: 'VND' },
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
              ]}
            />
          </Field>
          <Field label="Thẻ tín dụng: mặc định trả" wide>
            <Select
              value={policy}
              onChange={setPolicy}
              options={[
                { value: 'current_balance', label: 'Hết dư nợ hiện tại — không lãi, gọn nhất (khuyến nghị)' },
                { value: 'statement_balance', label: 'Đúng dư nợ sao kê — không lãi, giữ lại tiền chi tiêu sau sao kê' },
                { value: 'minimum', label: 'Tối thiểu — app sẽ cảnh báo lãi phát sinh' },
              ]}
            />
          </Field>
        </div>
        <button className="primary" onClick={create}>Bắt đầu</button>
        <p className="muted small-text">Sau đó thêm tổ chức đầu tiên (từ preset hoặc tự tạo) ở mục Khoản nợ.</p>
      </section>

      <section className="panel">
        <h2>Hoặc</h2>
        <div className="toolbar">
          <button onClick={() => store.addProfile(cloneProfile(structuredClone(appendixA), 'Ví dụ (Phụ lục A)'))}>Xem dữ liệu ví dụ</button>
          <button
            onClick={async () => {
              const f = await pickFile();
              if (f) tryImport(await f.text());
            }}
          >
            Nhập file JSON…
          </button>
        </div>
        {error && <p className="bad-text">{error}</p>}
      </section>
    </div>
  );
}
