import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { v1Seed } from '../src/domain/legacy/v1';
import { goTo, loadExample, openApp, tile, vnd } from './helpers';

test('chuyển dữ liệu app v1 từ localStorage', async ({ page }) => {
  await page.addInitScript((seed) => localStorage.setItem('debt-manager:v1', JSON.stringify(seed)), v1Seed);
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Tìm thấy dữ liệu của app v1' })).toBeVisible();
  await page.getByRole('button', { name: 'Chuyển dữ liệu v1' }).click();
  await expect(tile(page, 'Phải trả 11/2026')).toHaveText(vnd(28467963));
  await expect(tile(page, 'Tổng dư nợ')).toHaveText(vnd(119868159));
  await expect(tile(page, 'Đủ tiền trả nợ')).toHaveText(vnd(7632037));
});

test('xuất JSON rồi nhập lại vào trình duyệt khác cho cùng số liệu', async ({ page, browser }) => {
  await loadExample(page);
  await goTo(page, 'Cài đặt');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sao lưu ngay' }).click()]);
  const file = await download.path();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(data.schemaVersion).toBe(5);
  expect(data.obligations).toHaveLength(10);

  // Trình duyệt sạch (context mới, IndexedDB trống)
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await openApp(p2);
  const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByRole('button', { name: 'Nhập file JSON…' }).click()]);
  await chooser.setFiles(file);
  await expect(tile(p2, 'Tổng dư nợ')).toHaveText(vnd(119868159));
  await ctx.close();
});

test('xuất CSV lịch trả', async ({ page }) => {
  await loadExample(page);
  await goTo(page, 'Cài đặt');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Xuất CSV lịch trả' }).click()]);
  const csv = fs.readFileSync(await download.path(), 'utf8');
  expect(csv.split('\n')[0]).toContain('Khoản,Tổ chức,Kỳ,Ngày đến hạn');
  expect(csv).toContain('Trả góp VIB,VIB,1,2026-11-09,1960895');
});
