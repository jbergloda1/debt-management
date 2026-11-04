import { useEffect } from 'react';
import { addDays } from '../domain/dates';
import { createEngine } from '../domain/engine';
import { markShown, reminderSchedule, remindersDue, type Reminder } from '../domain/reminders';
import type { ISODate, ProfileState } from '../domain/types';
import { notificationsSupported, showNotification } from '../pwa/pwa';
import { storage, useStore } from './store';

/** Số ngày phía trước đưa vào hàng đợi cho service worker (đủ cho các lần app đóng lâu). */
const QUEUE_DAYS = 40;

/**
 * Tính lại hàng đợi nhắc, ghi vào IndexedDB (service worker đọc khi app đóng) và hiện các nhắc đến hạn.
 * Trả về các nhắc vừa hiện.
 */
export async function syncReminders(state: ProfileState, today: ISODate, enabled: boolean): Promise<Reminder[]> {
  const db = storage();
  if (!db) return [];
  const queue = reminderSchedule(createEngine(state, today), today, addDays(today, QUEUE_DAYS));
  await db.setMeta('reminderQueue', queue);
  if (!enabled || !notificationsSupported() || Notification.permission !== 'granted') return [];
  const shown = (await db.getMeta<string[]>('shownReminders')) ?? [];
  const due = remindersDue(queue, today, shown);
  for (const r of due) {
    await showNotification(r.title, { body: r.body, tag: r.key, icon: './icons/icon-192.png', data: { url: './#/dashboard' } });
  }
  if (due.length) await db.setMeta('shownReminders', markShown(queue, shown, due));
  return due;
}

/** Gắn ở khung app: đồng bộ nhắc mỗi khi dữ liệu, ngày, hoặc cài đặt nhắc thay đổi. */
export function useReminderSync() {
  const state = useStore((s) => s.state);
  const today = useStore((s) => s.today);
  const enabled = useStore((s) => s.notifyEnabled);
  useEffect(() => {
    if (!state) return;
    // Gõ liên tục trong form không ghi IndexedDB liên tục
    const t = setTimeout(() => syncReminders(state, today, enabled).catch((e) => console.warn('Nhắc hạn lỗi', e)), 800);
    return () => clearTimeout(t);
  }, [state, today, enabled]);
}
