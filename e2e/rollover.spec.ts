import { expect, test, type Page } from '@playwright/test';
import { dialog, field, row, tile, vnd } from './helpers';

// Dữ liệu ví dụ đang ở tháng 11/2026; hôm nay đã sang 02/12/2026.
const DEC_2 = '2026-12-02T09:00:00+07:00';

async function openExampleInDecember(page: Page) {
  await page.clock.setFixedTime(new Date(DEC_2));
  await page.goto('/');
  await page.getByRole('button', { name: 'Xem dữ liệu ví dụ' }).click();
  await expect(page.getByRole('region', { name: 'Nhắc sang tháng mới' })).toContainText('Đã sang tháng 12/2026');
}

async function runWizard(page: Page) {
  await page.getByRole('region', { name: 'Nhắc sang tháng mới' }).getByRole('button', { name: 'Bắt đầu' }).click();
  const d = dialog(page);
  await expect(d).toContainText('Sang tháng mới — 12/2026');

  // 1. Thanh toán tháng 11: 7 khoản chưa trả (trả góp VIB nằm trong sao kê nên không có dòng riêng)
  await expect(d.locator('.pay-item')).toHaveCount(7);
  await d.getByText('Đã trả tất cả').click();
  await d.getByRole('button', { name: 'Tiếp →' }).click();

  // 2. Sao kê mới — ngày điền sẵn theo quy tắc của thẻ
  const sac = d.getByRole('group', { name: 'Sao kê Thẻ Sacombank' });
  await expect(field(sac, 'Ngày sao kê')).toHaveValue('2026-11-10');
  await expect(field(sac, 'Ngày đến hạn')).toHaveValue('2026-12-05');
  await field(sac, 'Dư nợ sao kê').fill('5000000');
  await expect(d).toContainText('Trả góp VIB kỳ 2/9');
  const vib = d.getByRole('group', { name: 'Sao kê Thẻ VIB' });
  await field(vib, 'Dư nợ sao kê').fill('4000000');
  await field(vib, 'Dư nợ hiện tại').fill('4500000');
  await d.getByRole('button', { name: 'Tiếp →' }).click();

  // 3. Tiền hiện có
  await field(d, 'Tài khoản ngân hàng').fill('10000000');
  await d.getByRole('button', { name: 'Tiếp →' }).click();

  // 4. Xem lại: 5.000.000 + 4.500.000 + vay Sacombank 5.148.200 + Shinhan 5.101.434 + 2.071.000 + SFinance 913.000
  await expect(d).toContainText('Ghi nhận 7 khoản đã trả');
  await expect(d.locator('.tile', { hasText: 'Phải trả 12/2026' })).toContainText(vnd(22733634));
  return d;
}

test('sang tháng 12: trả hết tháng 11, nhập sao kê, cập nhật tiền', async ({ page }) => {
  await openExampleInDecember(page);
  const d = await runWizard(page);
  await d.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
  await expect(d).toBeHidden();

  await expect(tile(page, 'Phải trả 12/2026')).toHaveText(vnd(22733634));
  await expect(page.getByRole('region', { name: 'Nhắc sang tháng mới' })).toBeHidden();
  const vibRow = row(page, 'Thẻ VIB');
  await expect(vibRow).toContainText(vnd(4500000));
  await vibRow.getByRole('button', { name: 'Mở chi tiết' }).click();
  await expect(page.locator('tr.child')).toContainText('Kỳ 2/9');
  await expect(page.locator('.alert', { hasText: 'OVERDUE' })).toHaveCount(0);

  // Đã lưu
  await page.reload();
  await expect(tile(page, 'Phải trả 12/2026')).toHaveText(vnd(22733634));
});

test('huỷ giữa chừng thì không thay đổi gì', async ({ page }) => {
  await openExampleInDecember(page);
  await page.getByRole('region', { name: 'Nhắc sang tháng mới' }).getByRole('button', { name: 'Bắt đầu' }).click();
  await dialog(page).getByText('Đã trả tất cả').click();
  await dialog(page).getByRole('button', { name: 'Huỷ' }).click();
  await expect(tile(page, 'Phải trả 11/2026')).toHaveText(vnd(28467963));
  await expect(tile(page, 'Đã trả')).toHaveText(vnd(0));
});

test('"Hoàn tất & sao lưu" tải file sao lưu có dữ liệu tháng mới', async ({ page }) => {
  await openExampleInDecember(page);
  const d = await runWizard(page);
  const [download] = await Promise.all([page.waitForEvent('download'), d.getByRole('button', { name: 'Hoàn tất & sao lưu' }).click()]);
  expect(download.suggestedFilename()).toBe('quan-ly-no-vi-du-phu-luc-a-2026-12-02.json');
  await expect(page.getByRole('region', { name: 'Nhắc sao lưu' })).toBeHidden();
});
