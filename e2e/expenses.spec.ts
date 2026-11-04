import { expect, test } from '@playwright/test';
import { goTo, loadExample, tile, vnd } from './helpers';

test('thêm chi tiêu hàng tháng → trừ vào tiền còn lại, dòng tiền theo ngày và dự phóng', async ({ page }) => {
  await loadExample(page);
  await goTo(page, 'Dòng tiền');
  const sec = page.getByRole('region', { name: 'Chi tiêu' });
  await sec.getByRole('button', { name: '+ Chi tiêu hàng tháng' }).click();
  const row = sec.locator('tbody tr').last();
  await row.locator('input').first().fill('Tiền nhà');
  await row.locator('select').first().selectOption({ label: 'Nhà ở' });
  await row.locator('input.num').first().fill('4000000');
  await row.locator('input[type="number"]').fill('5');

  await expect(sec).toContainText('Tháng 11/2026:');
  await expect(sec.locator('.category-chip')).toContainText('Nhà ở');
  await expect(tile(page, 'Chi tiêu còn lại')).toHaveText(vnd(4000000));
  // 7.632.037 − 4.000.000
  await expect(tile(page, 'Đủ tiền — còn lại')).toHaveText(vnd(3632037));
  await expect(page.locator('tbody tr', { hasText: 'Tiền nhà' }).last()).toContainText('05/11/2026');

  await goTo(page, 'Tổng quan');
  await expect(tile(page, 'Đủ tiền trả nợ')).toHaveText(vnd(3632037));
  await expect(page.locator('.tile', { hasText: 'Đủ tiền trả nợ' })).toContainText('chi tiêu 4.000.000');

  await goTo(page, 'Dự phóng');
  const dec = page.locator('tbody tr', { hasText: '12/2026' }).first();
  await expect(dec).toContainText(vnd(4000000));
  await expect(dec).toContainText(vnd(4805471 - 4000000));

  await goTo(page, 'Lịch');
  await expect(page.locator('.cal-item.expense')).toContainText('Tiền nhà');
});

test('khoản chi một lần đã qua (trước hôm nay) không trừ lại', async ({ page }) => {
  await loadExample(page);
  await goTo(page, 'Dòng tiền');
  const sec = page.getByRole('region', { name: 'Chi tiêu' });
  await sec.getByRole('button', { name: '+ Khoản chi một lần' }).click();
  const row = sec.locator('tbody tr').last();
  await row.locator('input.num').first().fill('1000000');
  await row.locator('input[type="date"]').fill('2026-11-02');
  await expect(tile(page, 'Chi tiêu còn lại')).toHaveText(vnd(0));
  await row.locator('input[type="date"]').fill('2026-11-20');
  await expect(tile(page, 'Chi tiêu còn lại')).toHaveText(vnd(1000000));
});
