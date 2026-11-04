import { useState } from 'react';
import { useBackup, useBackupStatus } from '../../state/backup';
import { useProfile } from '../../state/hooks';
import { useStore } from '../../state/store';

/** Nhắc sao lưu trên Tổng quan: dữ liệu chỉ nằm trên thiết bị này. */
export function BackupBanner() {
  const state = useProfile();
  const status = useBackupStatus(state);
  const { backupNow, snooze } = useBackup();
  const setNotice = useStore((s) => s.setNotice);
  const [busy, setBusy] = useState(false);
  if (!status.due) return null;

  const run = () => {
    setBusy(true);
    // Gọi backupNow ngay trong sự kiện bấm (bảng Chia sẻ của iPhone cần thao tác người dùng)
    backupNow(state)
      .then((r) => r !== 'cancelled' && setNotice('Đã sao lưu. Hãy giữ file ở nơi an toàn như iCloud Drive hoặc Google Drive.'))
      .catch((e) => setNotice(`Không sao lưu được: ${(e as Error).message}`))
      .finally(() => setBusy(false));
  };

  return (
    <section className="backup-banner" role="region" aria-label="Nhắc sao lưu">
      <div>
        <b>{status.daysSince === null ? 'Bạn chưa sao lưu dữ liệu lần nào' : `Đã ${status.daysSince} ngày chưa sao lưu`}</b>
        <p>Dữ liệu chỉ nằm trên thiết bị này — mất máy, xoá app hoặc xoá dữ liệu trình duyệt là mất hết.</p>
      </div>
      <div className="backup-actions">
        <button className="primary" disabled={busy} onClick={run}>Sao lưu ngay</button>
        <button className="ghost" onClick={() => snooze()}>Để sau</button>
      </div>
    </section>
  );
}
