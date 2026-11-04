import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { goTo, loadExample } from './helpers';

// Thay Notification thật bằng bản ghi lại để kiểm tra nội dung (dev server: không có service worker).
async function fakeNotifications(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __notes: { title: string; body?: string; tag?: string }[] };
    w.__notes = JSON.parse(sessionStorage.getItem('__notes') ?? '[]');
    class FakeNotification {
      static permission: NotificationPermission = 'default';
      static async requestPermission() {
        FakeNotification.permission = 'granted';
        return 'granted' as const;
      }
      onclick: (() => void) | null = null;
      constructor(title: string, opts: NotificationOptions = {}) {
        w.__notes.push({ title, body: opts.body, tag: opts.tag });
        sessionStorage.setItem('__notes', JSON.stringify(w.__notes));
      }
      close() {}
    }
    // Sau khi đã cho phép, các lần tải lại vẫn giữ quyền
    if (sessionStorage.getItem('__granted')) FakeNotification.permission = 'granted';
    const orig = FakeNotification.requestPermission;
    FakeNotification.requestPermission = async () => {
      sessionStorage.setItem('__granted', '1');
      return orig();
    };
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
  });
}

const notes = (page: Page) => page.evaluate(() => (window as unknown as { __notes: { title: string; body?: string }[] }).__notes);

test('bật nhắc hạn → nhắc Sacombank (hạn hôm nay) và VIB (còn 5 ngày), không nhắc lại khi mở lại app', async ({ page }) => {
  await fakeNotifications(page);
  await loadExample(page);
  await goTo(page, 'Cài đặt');

  const panel = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Nhắc hạn & ứng dụng' }) });
  await expect(panel.locator('.reminders-preview')).toContainText('Thẻ Sacombank đến hạn hôm nay');
  await panel.getByRole('button', { name: 'Bật nhắc hạn' }).click();
  await expect(panel.locator('.notice')).toContainText('Đã bật nhắc hạn — vừa nhắc 2 khoản');

  const first = await notes(page);
  expect(first.map((n) => n.title)).toEqual(['Thẻ Sacombank đến hạn hôm nay', 'Thẻ VIB đến hạn sau 5 ngày']);
  expect(first[0].body?.replace(/ /g, ' ')).toContain('8.366.746 ₫ · hạn 04/11/2026');

  // Mở lại app: đã nhắc rồi thì không nhắc nữa
  await page.reload();
  await expect(page.getByRole('menuitem', { name: 'Tổng quan' })).toBeVisible();
  await page.waitForTimeout(1500); // đồng bộ nhắc chạy sau 800ms
  expect(await notes(page)).toHaveLength(2);
  await expect(panel.getByText('đang bật')).toBeVisible();
});

test('đổi "nhắc trước" thay đổi lịch nhắc', async ({ page }) => {
  await loadExample(page);
  await goTo(page, 'Cài đặt');
  const panel = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Nhắc hạn & ứng dụng' }) });
  const input = panel.locator('label.field', { hasText: 'Nhắc trước hạn (ngày)' }).locator('input');
  await input.fill('6');
  await input.blur();
  // Shinhan 1 hạn 15/11 → nhắc 09/11 thay vì 10/11
  const shinhan = panel.locator('.reminders-preview tr', { hasText: 'Shinhan khoản 1' });
  await expect(shinhan.first()).toContainText('09/11/2026');
  await expect(shinhan.filter({ hasText: '10/11/2026' })).toHaveCount(0);
});

test('tải lịch nhắc .ics', async ({ page }) => {
  await loadExample(page);
  await goTo(page, 'Cài đặt');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Tải lịch nhắc (.ics)' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const ics = fs.readFileSync(await download.path(), 'utf8').replace(/\r\n /g, '');
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('SUMMARY:Trả Thẻ Sacombank: 8.366.746');
  expect(ics).toContain('TRIGGER;RELATED=START:-PT111H');
});
