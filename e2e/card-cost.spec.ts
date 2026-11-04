import { expect, test } from '@playwright/test';
import { dialog, field, goTo, loadExample, vnd } from './helpers';

const panel = (page: import('@playwright/test').Page, card: string) => page.getByRole('region', { name: `Chi phí nếu không trả đủ ${card}` });

test('tham khảo chi phí nếu chỉ trả tối thiểu / trả trễ', async ({ page }) => {
  await loadExample(page);
  await goTo(page, 'Thẻ & hạn mức');

  const vib = panel(page, 'Thẻ VIB');
  await expect(vib).toContainText('tối thiểu 3.570.681');
  await expect(vib).toContainText('3,54%/tháng');
  const vibMin = vib.locator('tbody tr', { hasText: 'Chỉ trả tối thiểu' });
  await expect(vibMin).toContainText(vnd(136983)); // (7.246.783 − gốc trả góp 3.377.202) × 3,54%
  await expect(vib.locator('tbody tr', { hasText: 'Trả trễ hạn' })).toContainText('chưa nhập');
  await expect(vib.locator('.payoff')).toContainText('30 năm 2 tháng');

  const sac = panel(page, 'Thẻ Sacombank');
  await expect(sac).toContainText('2,00% – 3,19%/tháng');
  const late = sac.locator('tbody tr', { hasText: 'Trả trễ hạn' });
  await expect(late).toContainText(vnd(200000)); // 6% × 236.736 < 200.000
  await expect(late).toContainText(vnd(357824)); // 157.824 + 200.000
  await expect(late).toContainText(vnd(451729)); // 251.729 + 200.000
});

test('nhập phí chậm thanh toán cho thẻ → mục tham khảo tính phí', async ({ page }) => {
  await loadExample(page);
  await page.goto('/#/obligation/card-vib');
  await page.getByRole('button', { name: 'Sửa' }).first().click();
  const d = dialog(page);
  await expect(field(d, 'Lãi suất thẻ/tháng')).toHaveValue('3,54');
  await field(d, 'Phí chậm thanh toán %').fill('6');
  await field(d, 'Phí chậm thanh toán ít nhất').fill('299000');
  await d.getByRole('button', { name: 'Lưu thay đổi' }).click();

  await goTo(page, 'Thẻ & hạn mức');
  // 6% × 3.570.681 = 214.241 < 299.000
  const late = panel(page, 'Thẻ VIB').locator('tbody tr', { hasText: 'Trả trễ hạn' });
  await expect(late).toContainText(vnd(299000));
  await expect(late).toContainText(vnd(136983 + 299000));
});
