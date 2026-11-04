import { expect, test, type Page } from '@playwright/test';
import { goTo, loadExample, tile, vnd } from './helpers';

/** Hạ "Nguồn khác" 19tr → 2,9tr: tổng số dư 5,5tr, lương 14,5tr về 10/11 → cả tháng 20tr (cần 28,47tr). */
export async function makeShort(page: Page) {
  await loadExample(page);
  await goTo(page, 'Dòng tiền');
  const accounts = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Tài khoản tiền' }) });
  await accounts.locator('tbody tr').nth(2).locator('input.num').fill('2900000');
  await expect(tile(page, 'Số dư các tài khoản')).toHaveText(vnd(5500000));
  await goTo(page, 'Tổng quan');
}

test('thiếu tiền → gợi ý trả tối thiểu đúng hạn, trả thêm VIB sau khi lương về; dùng / bỏ kế hoạch', async ({ page }) => {
  await makeShort(page);
  const panel = page.getByRole('region', { name: 'Gợi ý trả khi thiếu tiền' });
  await expect(panel).toBeVisible();
  const vib = panel.locator('tbody tr', { hasText: 'Thẻ VIB' });
  await expect(vib).toContainText(vnd(3570681));
  await expect(vib).toContainText(vnd(3338149));
  await expect(panel.locator('tbody tr', { hasText: 'Shinhan khoản 1' })).toContainText('(đủ)');
  await expect(panel.locator('.plan-foot')).toContainText('294.807');
  await expect(panel.locator('.badge.red')).toHaveCount(0);

  await panel.getByRole('button', { name: 'Dùng kế hoạch này' }).click();
  await expect(panel).toContainText('Đang dùng kế hoạch này');
  await expect(tile(page, 'Đủ tiền trả nợ')).toHaveText(vnd(3338149));

  await page.reload();
  await expect(panel).toContainText('Đang dùng kế hoạch này');
  await panel.getByRole('button', { name: 'Bỏ kế hoạch' }).click();
  await expect(panel.getByRole('button', { name: 'Dùng kế hoạch này' })).toBeVisible();
});

test('đủ tiền thì không hiện gợi ý', async ({ page }) => {
  await loadExample(page);
  await expect(tile(page, 'Đủ tiền trả nợ')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Gợi ý trả khi thiếu tiền' })).toHaveCount(0);
});
