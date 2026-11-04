import { useEffect } from 'react';
import { create } from 'zustand';
import { saveFile, slug, type SaveResult } from '../data/io';
import { backupFileName, backupStatus, snoozeUntil, type BackupStatus } from '../domain/backup';
import type { ProfileState } from '../domain/types';
import { storage, useStore } from './store';

const lastKey = (id: string) => `lastBackup:${id}`;
const snoozeKey = (id: string) => `backupSnooze:${id}`;

export type PersistState = 'persisted' | 'best-effort' | 'unsupported';

interface BackupStore {
  profileId?: string;
  lastBackupAt?: string;
  snoozedUntil?: string;
  persist: PersistState;
  load(profileId: string): Promise<void>;
  /** Sao lưu profile hiện tại. Gọi ngay trong sự kiện bấm (bảng Chia sẻ cần thao tác người dùng). */
  backupNow(state: ProfileState): Promise<SaveResult>;
  snooze(): Promise<void>;
}

export const useBackup = create<BackupStore>((set, get) => ({
  persist: 'unsupported',

  async load(profileId) {
    const db = storage();
    const [lastBackupAt, snoozedUntil] = await Promise.all([db.getMeta<string>(lastKey(profileId)), db.getMeta<string>(snoozeKey(profileId))]);
    set({ profileId, lastBackupAt, snoozedUntil });
  },

  async backupNow(state) {
    const now = new Date();
    const result = await saveFile(backupFileName(slug(state.profile.name), now), JSON.stringify(state, null, 2), 'application/json');
    if (result !== 'cancelled') {
      await storage().setMeta(lastKey(state.profile.id), now.toISOString());
      if (get().profileId === state.profile.id) set({ lastBackupAt: now.toISOString(), snoozedUntil: undefined });
    }
    return result;
  },

  async snooze() {
    const id = get().profileId;
    if (!id) return;
    const until = snoozeUntil(new Date());
    await storage().setMeta(snoozeKey(id), until);
    set({ snoozedUntil: until });
  },
}));

/** Xin trình duyệt giữ dữ liệu lâu dài (hạn chế tự dọn khi thiếu bộ nhớ / lâu không mở). */
export async function requestPersistentStorage(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported';
  const already = await navigator.storage.persisted();
  const ok = already || (await navigator.storage.persist());
  const persist: PersistState = ok ? 'persisted' : 'best-effort';
  useBackup.setState({ persist });
  return persist;
}

/** Gắn ở khung app: nạp trạng thái sao lưu của profile đang mở và xin lưu trữ lâu dài. */
export function useBackupSync() {
  const profileId = useStore((s) => s.state?.profile.id);
  const load = useBackup((s) => s.load);
  useEffect(() => {
    if (profileId) load(profileId);
  }, [profileId, load]);
  useEffect(() => {
    requestPersistentStorage().catch(() => undefined);
  }, []);
}

/** Trạng thái nhắc sao lưu của profile đang mở. */
export function useBackupStatus(state: ProfileState): BackupStatus {
  const { lastBackupAt, snoozedUntil, profileId } = useBackup();
  const hasData = state.obligations.length > 0;
  // Chưa nạp xong meta của profile này → chưa nhắc (tránh nhấp nháy)
  if (profileId !== state.profile.id) return { due: false, daysSince: null };
  return backupStatus({ lastBackupAt, snoozedUntil, hasData, now: new Date() });
}
