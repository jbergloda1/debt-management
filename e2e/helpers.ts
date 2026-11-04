import { expect, type Locator, type Page } from '@playwright/test';

/** "Hôm nay" cố định cho mọi E2E — trùng ngày của golden test domain. */
export const TODAY = '2026-11-04T10:00:00+07:00';

/** Số tiền VND như app hiển thị: 28.467.963 ₫ (khoảng trắng có thể là NBSP). */
export const vnd = (n: number) => new RegExp(`${n.toLocaleString('vi-VN').replace(/\./g, '\\.')}\\s*₫`);

/** Mở app ở trạng thái sạch (mỗi test Playwright có context/IndexedDB riêng). */
export async function openApp(page: Page) {
  await page.clock.setFixedTime(new Date(TODAY));
  await page.goto('/');
}

export async function loadExample(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Xem dữ liệu ví dụ' }).click();
  await expect(tile(page, 'Tổng dư nợ')).toBeVisible();
}

/** Giá trị của thẻ KPI theo nhãn. */
export const tile = (page: Page, label: string | RegExp): Locator =>
  page.locator('.tile').filter({ has: page.locator('.tile-label', { hasText: label }) }).locator('.tile-value');

/** Dòng trong bảng có chứa nút/link mang tên khoản. */
export const row = (page: Page, name: string): Locator =>
  page.locator('tbody tr').filter({ has: page.getByRole('button', { name, exact: true }) });

export async function goTo(page: Page, menu: string) {
  await page.getByRole('menuitem', { name: menu }).click();
}

export const dialog = (page: Page) => page.getByRole('dialog');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Ô nhập của component <Field> có nhãn đúng bằng `label`. getByLabel không dùng được vì
 * accessible name còn gồm dòng gợi ý và option đang chọn của <select>.
 * Trả về mọi ô khớp — dùng .first()/.last() khi nhãn lặp lại.
 */
export const field = (scope: Locator, label: string): Locator =>
  scope
    .locator('label.field')
    .filter({ has: scope.page().locator('.field-label', { hasText: new RegExp(`^${escapeRe(label)}$`) }) })
    .locator('input, select, textarea');
