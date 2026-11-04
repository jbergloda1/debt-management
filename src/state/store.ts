import { create } from 'zustand';
import type { StorageAdapter } from '../data/storage/adapter';
import { IndexedDBAdapter } from '../data/storage/indexedDb';
import { todayISO } from '../domain/dates';
import { migrate } from '../domain/migrations';
import type { ID, Profile, ProfileState } from '../domain/types';

export const LEGACY_V1_KEY = 'debt-manager:v1';
const ACTIVE_KEY = 'activeProfileId';
const NOTIFY_KEY = 'notifyEnabled';

interface AppStore {
  ready: boolean;
  profiles: Profile[];
  state: ProfileState | null;
  today: string;
  privacy: boolean;
  /** Nhắc hạn bằng thông báo trên thiết bị này (lưu trong meta, không theo profile) */
  notifyEnabled: boolean;
  notice?: string;
  init(): Promise<void>;
  update(fn: (s: ProfileState) => ProfileState): void;
  /** Thêm profile mới (đã migrate/validate) và chuyển sang nó */
  addProfile(state: ProfileState): Promise<void>;
  /** Ghi đè profile hiện tại (sau khi đã sao lưu) */
  replaceCurrent(state: ProfileState): Promise<void>;
  switchProfile(id: ID): Promise<void>;
  deleteProfile(id: ID): Promise<void>;
  setPrivacy(on: boolean): void;
  setNotifyEnabled(on: boolean): Promise<void>;
  setNotice(msg?: string): void;
}

let adapter: StorageAdapter;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Kho lưu trữ đang dùng (sau init) — cho các phần cần meta như nhắc hạn. */
export const storage = (): StorageAdapter => adapter;

async function loadProfile(id: ID): Promise<ProfileState | null> {
  const raw = await adapter.load(id);
  if (!raw) return null;
  const { state, from } = migrate(raw);
  if (from !== undefined) {
    await adapter.backup(id, raw, `migrate từ ${from}`);
    await adapter.save(state);
  }
  return state;
}

export const useStore = create<AppStore>((set, get) => ({
  ready: false,
  profiles: [],
  state: null,
  today: todayISO(),
  privacy: false,
  notifyEnabled: false,

  async init() {
    if (adapter) return; // StrictMode gọi effect hai lần
    adapter = new IndexedDBAdapter();
    const profiles = await adapter.listProfiles();
    const activeId = (await adapter.getMeta<string>(ACTIVE_KEY)) ?? profiles[0]?.id;
    let state: ProfileState | null = null;
    let notice: string | undefined;
    if (activeId) {
      try {
        state = await loadProfile(activeId);
      } catch (e) {
        notice = `Không đọc được profile: ${(e as Error).message}`;
      }
    }
    const notifyEnabled = (await adapter.getMeta<boolean>(NOTIFY_KEY)) ?? false;
    set({ ready: true, profiles, state, notice, notifyEnabled });
    // Cập nhật "hôm nay" khi qua ngày mới mà app vẫn mở
    setInterval(() => {
      const t = todayISO();
      if (t !== get().today) set({ today: t });
    }, 60_000);
  },

  update(fn) {
    const cur = get().state;
    if (!cur) return;
    const next = fn(cur);
    set({ state: next, profiles: get().profiles.map((p) => (p.id === next.profile.id ? next.profile : p)) });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => adapter.save(next).catch((e) => set({ notice: `Lỗi lưu dữ liệu: ${e}` })), 250);
  },

  async addProfile(state) {
    await adapter.save(state);
    await adapter.setMeta(ACTIVE_KEY, state.profile.id);
    set({ state, profiles: [...get().profiles.filter((p) => p.id !== state.profile.id), state.profile] });
  },

  async replaceCurrent(next) {
    const cur = get().state;
    if (cur) await adapter.backup(cur.profile.id, cur, 'trước khi nhập đè');
    const merged = cur ? { ...next, profile: { ...next.profile, id: cur.profile.id } } : next;
    await adapter.save(merged);
    set({ state: merged, profiles: get().profiles.map((p) => (p.id === merged.profile.id ? merged.profile : p)) });
  },

  async switchProfile(id) {
    clearTimeout(saveTimer);
    const cur = get().state;
    if (cur) await adapter.save(cur);
    const state = await loadProfile(id);
    await adapter.setMeta(ACTIVE_KEY, id);
    set({ state });
  },

  async deleteProfile(id) {
    const cur = get().state;
    await adapter.backup(id, cur?.profile.id === id ? cur : await adapter.load(id), 'trước khi xoá profile');
    await adapter.deleteProfile(id);
    const profiles = get().profiles.filter((p) => p.id !== id);
    set({ profiles });
    if (cur?.profile.id === id) {
      if (profiles[0]) await get().switchProfile(profiles[0].id);
      else {
        await adapter.setMeta(ACTIVE_KEY, undefined);
        set({ state: null });
      }
    }
  },

  setPrivacy: (privacy) => set({ privacy }),
  async setNotifyEnabled(on) {
    await adapter.setMeta(NOTIFY_KEY, on);
    set({ notifyEnabled: on });
  },
  setNotice: (notice) => set({ notice }),
}));

/** Dữ liệu app v1 còn trong localStorage (cùng origin) — để đề nghị chuyển sang. */
export function readLegacyV1(): unknown | null {
  try {
    const raw = localStorage.getItem(LEGACY_V1_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
