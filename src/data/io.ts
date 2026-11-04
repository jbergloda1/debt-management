import type { Engine } from '../domain/engine';
import type { ProfileState } from '../domain/types';

export function download(filename: string, content: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const downloadJson = (filename: string, data: unknown) => download(filename, JSON.stringify(data, null, 2), 'application/json');

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

export function pickFile(accept = 'application/json,.json'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
