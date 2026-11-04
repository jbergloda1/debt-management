/** Sau bao nhiêu ngày không sao lưu thì nhắc. */
export const BACKUP_INTERVAL_DAYS = 30;
/** "Để sau" ẩn nhắc trong bao nhiêu ngày. */
export const BACKUP_SNOOZE_DAYS = 7;

const DAY = 86_400_000;

export interface BackupStatus {
  /** Có nên hiện nhắc sao lưu không */
  due: boolean;
  /** Số ngày từ lần sao lưu gần nhất (null nếu chưa từng) */
  daysSince: number | null;
}

/**
 * Nhắc khi profile có dữ liệu và (chưa từng sao lưu hoặc đã quá BACKUP_INTERVAL_DAYS ngày),
 * trừ khi người dùng vừa bấm "Để sau".
 */
export function backupStatus(opts: { lastBackupAt?: string; snoozedUntil?: string; hasData: boolean; now: Date }): BackupStatus {
  const { lastBackupAt, snoozedUntil, hasData, now } = opts;
  const daysSince = lastBackupAt ? Math.floor((now.getTime() - new Date(lastBackupAt).getTime()) / DAY) : null;
  const stale = daysSince === null || daysSince >= BACKUP_INTERVAL_DAYS;
  const snoozed = !!snoozedUntil && new Date(snoozedUntil).getTime() > now.getTime();
  return { due: hasData && stale && !snoozed, daysSince };
}

export const snoozeUntil = (now: Date) => new Date(now.getTime() + BACKUP_SNOOZE_DAYS * DAY).toISOString();

/** Tên file sao lưu: quan-ly-no-<profile>-2026-11-04.json */
export const backupFileName = (profileSlug: string, now: Date) => {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `quan-ly-no-${profileSlug || 'profile'}-${d}.json`;
};
