import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { goTo, loadExample, openApp, TODAY, tile, vnd } from './helpers';

const banner = (page: Page) => page.getByRole('region', { name: 'Nhắc sao lưu' });
const DAY = 86_400_000;

test('chưa sao lưu → nhắc; sao lưu xong thì hết nhắc, 30 ngày sau nhắc lại', async ({ page }) => {
  await loadExample(page);
  await expect(banner(page)).toContainText('Bạn chưa sao lưu dữ liệu lần nào');

  const [download] = await Promise.all([page.waitForEvent('download'), banner(page).getByRole('button', { name: 'Sao lưu ngay' }).click()]);
  expect(download.suggestedFilename()).toBe('quan-ly-no-vi-du-phu-luc-a-2026-11-04.json');
  const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(data.obligations).toHaveLength(10);
  await expect(banner(page)).toBeHidden();

  // Mở lại app: vẫn nhớ đã sao lưu
  await page.reload();
  await expect(tile(page, 'Tổng dư nợ')).toHaveText(vnd(119868159));
  await expect(banner(page)).toBeHidden();
  await goTo(page, 'Cài đặt');
  await expect(page.getByText('Lần sao lưu gần nhất:')).not.toContainText('chưa có');

  // 31 ngày sau
  await page.clock.setFixedTime(new Date(new Date(TODAY).getTime() + 31 * DAY));
  await page.goto('/#/dashboard');
  await expect(banner(page)).toContainText('Đã 31 ngày chưa sao lưu');
});

test('"Để sau" ẩn nhắc 7 ngày', async ({ page }) => {
  await loadExample(page);
  await banner(page).getByRole('button', { name: 'Để sau' }).click();
  await expect(banner(page)).toBeHidden();
  await page.reload();
  await expect(tile(page, 'Tổng dư nợ')).toBeVisible();
  await expect(banner(page)).toBeHidden();

  await page.clock.setFixedTime(new Date(new Date(TODAY).getTime() + 8 * DAY));
  await page.reload();
  await expect(banner(page)).toBeVisible();
});

test('profile chưa có khoản nợ thì không nhắc', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(page.getByText('Chưa có khoản nợ nào')).toBeVisible();
  await expect(banner(page)).toBeHidden();
});

test.describe('điện thoại: sao lưu qua bảng Chia sẻ', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  async function fakeShare(page: Page, cancel = false) {
    await page.addInitScript((cancel) => {
      const w = window as unknown as { __shared: { name: string; type: string; text: string }[] };
      w.__shared = [];
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          for (const f of data.files ?? []) w.__shared.push({ name: f.name, type: f.type, text: await f.text() });
          if (cancel) throw new DOMException('Người dùng huỷ', 'AbortError');
        },
      });
    }, cancel);
  }
  const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: { name: string; type: string; text: string }[] }).__shared);

  test('chia sẻ file JSON thay vì tải xuống', async ({ page }) => {
    await fakeShare(page);
    await loadExample(page);
    await banner(page).getByRole('button', { name: 'Sao lưu ngay' }).click();
    await expect(banner(page)).toBeHidden();
    const files = await shared(page);
    expect(files.map((f) => [f.name, f.type])).toEqual([['quan-ly-no-vi-du-phu-luc-a-2026-11-04.json', 'application/json']]);
    expect(JSON.parse(files[0].text).profile.name).toBe('Ví dụ (Phụ lục A)');
  });

  test('huỷ bảng Chia sẻ thì không tính là đã sao lưu', async ({ page }) => {
    await fakeShare(page, true);
    await loadExample(page);
    await banner(page).getByRole('button', { name: 'Sao lưu ngay' }).click();
    await expect.poll(async () => (await shared(page)).length).toBe(1);
    await expect(banner(page)).toBeVisible();
  });
});
