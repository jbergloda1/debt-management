import { expect, test } from '@playwright/test';
import { loadExample, tile, vnd } from './helpers';

// Chạy trên bản build (vite preview) vì service worker chỉ đăng ký ở production.

test('manifest và icon hợp lệ để cài app', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(new URL(href!, page.url()).href)).json();
  expect(manifest).toMatchObject({ short_name: 'Quản lý nợ', display: 'standalone', theme_color: '#0d9488' });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const res = await request.get(new URL(icon.src, new URL(href!, page.url())).href);
    expect(res.ok(), icon.src).toBe(true);
  }
});

test('dùng được khi mất mạng sau lần mở đầu tiên', async ({ page, context }) => {
  await loadExample(page);
  // Chờ service worker cài xong và kiểm soát trang
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(tile(page, 'Tổng dư nợ')).toHaveText(vnd(119868159));
  await page.goto('/#/calendar');
  await expect(page.getByRole('heading', { name: /Lịch đến hạn/ })).toBeVisible();
  await context.setOffline(false);
});
