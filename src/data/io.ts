import type { Engine } from '../domain/engine';
import type { ProfileState } from '../domain/types';

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/** Điện thoại/tablet: dùng bảng Chia sẻ (lưu vào Tệp/iCloud, gửi Zalo, email…) thay cho tải file. */
const preferShareSheet = () =>
  /iphone|ipad|ipod|android/i.test(navigator.userAgent) || window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Lưu file: trên điện thoại mở bảng Chia sẻ nếu có, còn lại tải file.
 * Phải gọi ngay trong sự kiện bấm (không await trước đó) — trình duyệt chỉ cho share khi có thao tác người dùng.
 */
export async function saveFile(filename: string, content: string, type: string): Promise<SaveResult> {
  const file = new File([content], filename, { type });
  if (preferShareSheet() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // Lỗi khác (ví dụ không được phép) → thử tải file
    }
  }
  download(filename, content, type);
  return 'downloaded';
}

export function download(filename: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const downloadJson = (filename: string, data: unknown) => saveFile(filename, JSON.stringify(data, null, 2), 'application/json');

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');

/** Lịch trả của mọi khoản vay (mục 16.3). */
export function schedulesCsv(engine: Engine): string {
  const rows: unknown[][] = [['Khoản', 'Tổ chức', 'Kỳ', 'Ngày đến hạn', 'Gốc', 'Lãi', 'Phí', 'Tổng', 'Gốc còn lại', 'Đã trả']];
  for (const l of engine.loans()) {
    const led = engine.ledger(l);
    for (const r of engine.schedule(l)) {
      rows.push([l.name, engine.institution(l.institutionId)?.name, r.n, r.dueDate, r.principal, r.interest, r.fees, r.total, r.principalRemainingAfter, led.rows[r.n - 1].paid ? 'x' : '']);
    }
  }
  return toCsv(rows);
}

export function paymentsCsv(state: ProfileState): string {
  const name = new Map(state.obligations.map((o) => [o.id, o.name]));
  return toCsv([
    ['Ngày', 'Khoản', 'Kỳ (dueItemKey)', 'Số tiền', 'Hình thức', 'Ghi chú'],
    ...[...state.payments].sort((a, b) => a.date.localeCompare(b.date)).map((p) => [p.date, name.get(p.obligationId), p.dueItemKey, p.amount, p.method, p.note]),
  ]);
}

/**
 * Mở hộp chọn file. Ô input được gắn vào trang trong lúc chọn: iOS Safari có thể không bắn sự kiện
 * `change` cho input không nằm trong DOM.
 */
export function pickFile(accept = 'application/json,.json'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(input);
    const done = (f: File | null) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    input.click();
  });
}

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
