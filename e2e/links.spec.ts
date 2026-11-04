import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendixA } from '../src/data/examples/appendixA';
import { dialog, field, goTo, loadExample, openApp, tile, vnd } from './helpers';

const vibPanel = (page: import('@playwright/test').Page) =>
  page.locator('section.panel', { has: page.getByRole('heading', { name: 'Hạn mức Thẻ VIB' }) }).first();

test('dữ liệu cũ tạo từ mẫu preset: tự gắn trả góp vào thẻ VIB, hạn mức đúng, tên hạn mức theo thẻ', async ({ page }) => {
  // File sao lưu kiểu bản trước: tên hạn mức theo mẫu, trả góp có link nhưng không gắn thẻ
  const old = {
    ...structuredClone(appendixA),
    schemaVersion: 1,
    creditLines: [
      { id: 'cl-sac', institutionId: 'inst-sac', name: 'Hạn mức Thẻ tín dụng (sao kê 10, đến hạn 5 tháng sau)', limit: 30000000 },
      { id: 'cl-vib', institutionId: 'inst-vib', name: 'Hạn mức Thẻ tín dụng (sao kê 25, đến hạn 10 tháng sau)', limit: 28800000 },
    ],
    obligations: appendixA.obligations.map((o) => (o.id === 'vib-1' ? { ...o, link: { sharesCreditLimit: true, billedIntoStatement: true } } : o)),
  };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-')), 'cu.json');
  fs.writeFileSync(file, JSON.stringify(old));

  await openApp(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Nhập file JSON…' }).click()]);
  await chooser.setFiles(file);
  await expect(tile(page, 'Phải trả 11/2026')).toHaveText(vnd(28467963));
  await expect(page.locator('.alert', { hasText: 'LINK_MISSING_CARD' })).toHaveCount(0);

  await goTo(page, 'Thẻ & hạn mức');
  await expect(page.getByRole('heading', { name: 'Hạn mức Thẻ Sacombank' })).toBeVisible();
  await expect(vibPanel(page).locator('.big-numbers')).toContainText(vnd(5866059));
  await expect(vibPanel(page)).toContainText('Trả góp VIB · gốc chưa lên sao kê');
});

test('đổi tên thẻ thì tên hạn mức đổi theo', async ({ page }) => {
  await loadExample(page);
  await page.goto('/#/obligation/card-vib');
  await page.getByRole('button', { name: 'Sửa' }).first().click(); // nút Sửa của thẻ (các nút sau là của sao kê)
  await field(dialog(page), 'Tên').fill('Thẻ VIB Online Plus');
  await dialog(page).getByRole('button', { name: 'Lưu thay đổi' }).click();
  await goTo(page, 'Thẻ & hạn mức');
  await expect(page.getByRole('heading', { name: 'Hạn mức Thẻ VIB Online Plus' })).toBeVisible();
});

test('chọn "Khoản vay độc lập" thì bỏ hẳn liên kết với thẻ', async ({ page }) => {
  await loadExample(page);
  await page.goto('/#/obligation/vib-1');
  await page.getByRole('button', { name: 'Sửa' }).click();
  const d = dialog(page);
  await field(d, 'Gắn vào thẻ').selectOption({ label: '— Khoản vay độc lập —' });
  await expect(d.getByText('Kỳ trả nằm trong sao kê thẻ')).toHaveCount(0);
});
