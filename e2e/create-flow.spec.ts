import { expect, test, type Page } from '@playwright/test';
import { dialog, field, goTo, openApp, row, tile, vnd } from './helpers';

// Luồng của người dùng mới (mục 21): onboarding → thêm thẻ + trả góp gộp sao kê → kiểm tra dashboard.

async function startBlank(page: Page) {
  await openApp(page);
  await field(page.locator('body'), 'Tên').fill('Của tôi');
  await page.getByRole('button', { name: 'Bắt đầu' }).click();
  await expect(page.getByText('Chưa có khoản nợ nào')).toBeVisible();
}

async function openNewObligation(page: Page) {
  await goTo(page, 'Khoản nợ');
  await page.getByRole('button', { name: '+ Thêm khoản nợ' }).click();
  return dialog(page);
}

async function addCard(page: Page) {
  const d = await openNewObligation(page);
  await field(d, 'Tên tổ chức').fill('Ngân hàng A');
  await field(d, 'Loại').last().selectOption({ label: 'Thẻ tín dụng' });
  await field(d, 'Tên').fill('Thẻ A');
  await field(d, 'Hạn mức').fill('20000000');
  // "Ngày sao kê"/"Ngày đến hạn" lặp lại (ngày trong quy tắc + sao kê gần nhất) → lấy ô cuối
  await field(d, 'Ngày sao kê').last().fill('2026-10-25');
  await field(d, 'Ngày đến hạn').last().fill('2026-11-10');
  await field(d, 'Dư nợ sao kê').fill('3000000');
  await field(d, 'Dư nợ hiện tại').fill('3500000');
  await d.getByRole('button', { name: 'Thêm khoản' }).click();
  await expect(page.getByRole('heading', { name: 'Thẻ A' })).toBeVisible();
}

test('thêm thẻ + trả góp gộp sao kê: không cộng hai lần, hạn mức đúng', async ({ page }) => {
  await startBlank(page);
  await addCard(page);

  const d = await openNewObligation(page);
  await field(d, 'Tên').fill('Trả góp điện thoại');
  await field(d, 'Số tiền vay (trên hợp đồng)').fill('6000000');
  await field(d, 'Ngày giải ngân / mở khoản').fill('2026-10-06');
  await field(d, 'Số kỳ').fill('6');
  await field(d, 'Cách tính lãi').selectOption({ label: 'Trả góp 0%' });
  await field(d, 'Quy tắc ngày trả').selectOption({ label: 'Sao kê ngày X, đến hạn ngày Y' });
  await field(d, 'Ngày sao kê').fill('25');
  await field(d, 'Ngày đến hạn').fill('10');
  await field(d, 'Gắn vào thẻ').selectOption({ label: 'Thẻ A' });
  await d.getByText('Kỳ trả nằm trong sao kê thẻ').click();
  // Xem trước bảng kỳ hạn: kỳ 1 lên sao kê 25/10 → đến hạn 10/11
  await expect(d.locator('.schedule tbody tr').first()).toContainText('10/11/2026');
  await d.getByRole('button', { name: 'Thêm khoản' }).click();
  await expect(page.getByRole('heading', { name: 'Trả góp điện thoại' })).toBeVisible();

  await goTo(page, 'Tổng quan');
  // Phải trả = dư nợ hiện tại thẻ (đã gồm kỳ 1/6), không cộng thêm 1.000.000
  await expect(tile(page, 'Phải trả 11/2026')).toHaveText(vnd(3500000));
  // Dư nợ = 3.500.000 + gốc kỳ 2–6 chưa lên sao kê (5.000.000)
  await expect(tile(page, 'Tổng dư nợ')).toHaveText(vnd(8500000));
  await expect(row(page, 'Thẻ A')).toContainText('gồm 1 kỳ trả góp');

  await goTo(page, 'Thẻ & hạn mức');
  await expect(page.locator('.big-numbers').first()).toContainText(vnd(11500000));
});

test('form khoản vay chặn số tiền mỗi kỳ không đủ trả gốc', async ({ page }) => {
  await startBlank(page);
  const d = await openNewObligation(page);
  await field(d, 'Tên tổ chức').fill('Công ty B');
  await field(d, 'Tên').fill('Vay tiền mặt');
  await field(d, 'Số tiền vay (trên hợp đồng)').fill('30000000');
  await field(d, 'Số kỳ').fill('12');
  await field(d, 'Số tiền mỗi kỳ (chưa gồm phí)').fill('1500000');
  await d.getByRole('button', { name: 'Thêm khoản' }).click();
  await expect(d.locator('.errors')).toContainText('Số tiền mỗi kỳ × số kỳ nhỏ hơn số tiền vay');

  // Sửa lại hợp lệ → lưu được, có APR tự tính
  await field(d, 'Số tiền mỗi kỳ (chưa gồm phí)').fill('3000000');
  await expect(d.locator('.tile', { hasText: 'Lãi danh nghĩa/năm' })).toContainText('35,1%');
  await d.getByRole('button', { name: 'Thêm khoản' }).click();
  await expect(page.getByRole('heading', { name: 'Vay tiền mặt' })).toBeVisible();
});
