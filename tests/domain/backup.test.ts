import { describe, expect, it } from 'vitest';
import { backupFileName, backupStatus, snoozeUntil } from '../../src/domain/backup';

const now = new Date('2026-11-04T10:00:00+07:00');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe('nhắc sao lưu', () => {
  it('chưa từng sao lưu → nhắc nếu đã có dữ liệu', () => {
    expect(backupStatus({ hasData: true, now })).toEqual({ due: true, daysSince: null });
    expect(backupStatus({ hasData: false, now }).due).toBe(false);
  });

  it('nhắc lại sau 30 ngày', () => {
    expect(backupStatus({ lastBackupAt: daysAgo(29), hasData: true, now })).toEqual({ due: false, daysSince: 29 });
    expect(backupStatus({ lastBackupAt: daysAgo(30), hasData: true, now })).toEqual({ due: true, daysSince: 30 });
  });

  it('"Để sau" ẩn 7 ngày', () => {
    const snoozedUntil = snoozeUntil(now);
    expect(backupStatus({ hasData: true, snoozedUntil, now }).due).toBe(false);
    expect(backupStatus({ hasData: true, snoozedUntil, now: new Date(now.getTime() + 7 * 86_400_000 + 1) }).due).toBe(true);
  });

  it('tên file theo ngày địa phương', () => {
    expect(backupFileName('ca-nhan', new Date(2026, 10, 4, 23, 30))).toBe('quan-ly-no-ca-nhan-2026-11-04.json');
  });
});
