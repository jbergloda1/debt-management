import type { ID, Profile, ProfileState } from '../../domain/types';

/** Mục 16.1 — có thể thay bằng RemoteAdapter (Supabase/Firebase) mà không đổi phần còn lại. */
export interface StorageAdapter {
  /** Trả về dữ liệu thô (chưa migrate) */
  load(profileId: ID): Promise<unknown | null>;
  save(state: ProfileState): Promise<void>;
  listProfiles(): Promise<Profile[]>;
  deleteProfile(id: ID): Promise<void>;
  /** Sao lưu bản cũ trước khi migrate / nhập đè */
  backup(profileId: ID, raw: unknown, reason: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
}
