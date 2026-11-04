import { expect, test } from '@playwright/test';
import { dialog, field, goTo, loadExample, row, tile, vnd } from './helpers';

// Dữ liệu ví dụ (Phụ lục A) — cùng số liệu với golden test domain, today = 04/11/2026.

test('tổng quan tháng 11/2026', async ({ page }) => {
  await loadExample(page);
  await expect(tile(page, 'Phải trả 11/2026')).toHaveText(vnd(28467963));
  await expect(tile(page, 'Tổng dư nợ')).toHaveText(vnd(119868159));
  await expect(tile(page, 'Đủ tiền trả nợ')).toHaveText(vnd(7632037));

  // Thẻ Sacombank đến hạn 05/11 → còn 1 ngày
  await expect(row(page, 'Thẻ Sacombank')).toContainText('Sắp đến hạn');
  await expect(page.locator('.alert', { hasText: 'DUE_SOON' })).toContainText('Thẻ Sacombank');

  // VIB: kỳ 1/9 của trả góp nằm trong sao kê, không cộng riêng
  const vib = row(page, 'Thẻ VIB');
  await expect(vib).toContainText(vnd(7246783));
  await expect(vib).toContainText(vnd(22933941));
  await vib.getByRole('button', { name: 'Mở chi tiết' }).click();
  await expect(page.locator('tr.child')).toContainText('Kỳ 1/9');
  await expect(page.locator('tr.child')).toContainText('đã nằm trong sao kê');
  await expect(page.getByRole('button', { name: 'Trả góp VIB', exact: true })).toHaveCount(0);
});

test('ghi nhận thanh toán thẻ VIB → kỳ trả góp cũng được tính đã trả, lưu qua reload', async ({ page }) => {
  await loadExample(page);
  const vib = row(page, 'Thẻ VIB');
  await vib.getByRole('button', { name: 'Ghi nhận' }).click();
  await expect(dialog(page)).toContainText('Ghi nhận thanh toán — Thẻ VIB');
  await dialog(page).getByRole('button', { name: 'Lưu thanh toán' }).click();
  await expect(dialog(page)).toBeHidden();

  await expect(vib).toContainText('Đã trả');
  await expect(tile(page, 'Đã trả')).toHaveText(vnd(7246783));
  await expect(tile(page, 'Tổng dư nợ')).toHaveText(vnd(119868159 - 7246783));

  // Hạn mức: chỉ còn gốc trả góp kỳ 2–9
  await goTo(page, 'Thẻ & hạn mức');
  const vibLine = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Hạn mức Thẻ VIB' }) }).first();
  await expect(vibLine.locator('.big-numbers')).toContainText(vnd(28800000 - 15687158));

  // Dữ liệu nằm trong IndexedDB → còn sau khi tải lại
  await page.reload();
  await goTo(page, 'Tổng quan');
  await expect(tile(page, 'Đã trả')).toHaveText(vnd(7246783));
});

test('trả một phần → trạng thái "Trả một phần"', async ({ page }) => {
  await loadExample(page);
  const shinhan = row(page, 'Shinhan khoản 1');
  await shinhan.getByRole('button', { name: 'Ghi nhận' }).click();
  await field(dialog(page), 'Số tiền').fill('1000000');
  await dialog(page).getByRole('button', { name: 'Lưu thanh toán' }).click();
  await expect(shinhan).toContainText('Trả một phần');
  await expect(tile(page, 'Còn phải trả')).toHaveText(vnd(28467963 - 1000000));
});

test('dự phóng tháng 12/2026', async ({ page }) => {
  await loadExample(page);
  await goTo(page, 'Dự phóng');
  const dec = page.locator('tbody tr', { hasText: '12/2026' }).first();
  await expect(dec).toContainText(vnd(15194529));
  await expect(dec).toContainText(vnd(4805471));
  await expect(dec).toContainText('Hết nợ Vay tiêu dùng 3');
  await expect(tile(page, 'Hết nợ trả góp dự kiến')).toHaveText('15/11/2027');
});

test('chế độ riêng tư ẩn số tiền', async ({ page }) => {
  await loadExample(page);
  await page.getByRole('button', { name: 'Ẩn số tiền' }).click();
  await expect(tile(page, 'Tổng dư nợ')).toHaveText('•••');
  await page.getByRole('button', { name: 'Hiện số tiền' }).click();
  await expect(tile(page, 'Tổng dư nợ')).toHaveText(vnd(119868159));
});
