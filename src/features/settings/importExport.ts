import { newId } from '../../domain/defaults';
import { migrate } from '../../domain/migrations';
import type { ProfileState } from '../../domain/types';
import { useStore } from '../../state/store';

/** Gán profile id mới (nhân bản) — cập nhật cả profileId của các khoản nợ. */
export function cloneProfile(s: ProfileState, name?: string): ProfileState {
  const id = newId('profile');
  return {
    ...s,
    profile: { ...s.profile, id, name: name ?? `${s.profile.name} (bản sao)` },
    obligations: s.obligations.map((o) => ({ ...o, profileId: id })),
  };
}

/**
 * Nhập JSON (đầy đủ hoặc của app v1). Trùng profile id → hỏi ghi đè hay nhân bản (mục 16.3).
 * Trả về thông báo cho người dùng.
 */
export async function importProfileJson(text: string): Promise<string> {
  const store = useStore.getState();
  const { state, from } = migrate(JSON.parse(text));
  const note = from === 'legacy-v1' ? ' (đã chuyển từ dữ liệu app v1)' : from !== undefined ? ` (đã nâng từ phiên bản ${from})` : '';
  const existing = store.profiles.find((p) => p.id === state.profile.id);
  if (existing) {
    const overwrite = confirm(
      `Profile "${existing.name}" đã có trên máy.\n\nOK = ghi đè (bản hiện tại được sao lưu)\nHuỷ = nhập thành profile mới (bản sao)`,
    );
    if (overwrite) {
      if (store.state?.profile.id !== existing.id) await store.switchProfile(existing.id);
      await useStore.getState().replaceCurrent(state);
      return `Đã ghi đè profile "${existing.name}"${note}.`;
    }
    const copy = cloneProfile(state);
    await store.addProfile(copy);
    return `Đã nhập thành profile mới "${copy.profile.name}"${note}.`;
  }
  await store.addProfile(state);
  return `Đã nhập profile "${state.profile.name}"${note}.`;
}
