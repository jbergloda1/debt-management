import { create } from 'zustand';

export const REMINDER_SYNC_TAG = 'debt-reminders';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Sự kiện cài app (Chrome/Edge) — null nếu trình duyệt không cho cài hoặc đã cài */
  installEvent: BeforeInstallPromptEvent | null;
  swActive: boolean;
}

export const usePwa = create<PwaState>(() => ({ installEvent: null, swActive: false }));

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installEvent: null }));
  // Dev server không dùng SW để tránh cache làm sai khi sửa code
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => usePwa.setState({ swActive: true }))
      .catch((e) => console.warn('Không đăng ký được service worker', e));
  }
}

export async function promptInstall(): Promise<boolean> {
  const e = usePwa.getState().installEvent;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  usePwa.setState({ installEvent: null });
  return outcome === 'accepted';
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

/**
 * Đăng ký kiểm tra nhắc hạn định kỳ khi app đóng (Periodic Background Sync — chỉ Chrome/Edge,
 * chỉ khi đã cài app; trình duyệt tự quyết tần suất, khoảng 1 lần/ngày).
 */
export async function enablePeriodicSync(): Promise<boolean> {
  if (!usePwa.getState().swActive) return false;
  const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
    periodicSync?: { register(tag: string, o: { minInterval: number }): Promise<void> };
  };
  if (!reg.periodicSync) return false;
  try {
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state !== 'granted') return false;
    await reg.periodicSync.register(REMINDER_SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

/** Hiện thông báo qua service worker nếu có (hoạt động cả trên Android), nếu không thì Notification thường. */
export async function showNotification(title: string, options: NotificationOptions & { data?: unknown }) {
  if (usePwa.getState().swActive && navigator.serviceWorker?.controller) {
    const reg = await navigator.serviceWorker.ready;
    return reg.showNotification(title, options);
  }
  const n = new Notification(title, options);
  n.onclick = () => {
    window.focus();
    location.hash = '/dashboard';
    n.close();
  };
}
