import { expect, test, type Page } from '@playwright/test';
import { dialog, loadExample } from './helpers';

// Không màn nào được tràn ngang trên điện thoại nhỏ (360px). Bảng dạng thẻ / vùng cuộn ngang hợp lệ thì được bỏ qua.
test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });

/** Chạy trong trang: phần tử tràn màn hình hoặc tràn khung chứa (không tính phần nằm trong vùng cuộn/cắt). */
function findOverflow() {
  const vw = document.documentElement.clientWidth;
  const CONTAINERS = '.panel, .tile, .ant-modal-content, .wizard-card, .pay-item, .backup-banner, .rollover-banner, .alert, .cal-cell';
  const contained = (e: Element) => {
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) return true;
    }
    return false;
  };
  const hits: string[] = [];
  const all = Array.from(document.querySelectorAll('body *'));
  const bad = new Set<Element>();
  for (const el of all) {
    if (el.closest('.side:not(.is-open), .sidebar-scrim, .viz-tooltip')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || contained(el)) continue;
    const box = el.parentElement?.closest(CONTAINERS);
    const limit = Math.min(vw, box ? box.getBoundingClientRect().right : vw);
    if (r.right > limit + 1 || r.left < -1) bad.add(el);
  }
  for (const el of bad) {
    if (bad.has(el.parentElement!)) continue;
    const text = ((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    hits.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ')[0]} "${text}"`);
  }
  return { pageOverflow: document.documentElement.scrollWidth - vw, hits };
}

async function expectNoOverflow(page: Page) {
  await page.waitForTimeout(150);
  const r = await page.evaluate(findOverflow);
  expect(r.hits, 'phần tử tràn').toEqual([]);
  expect(r.pageOverflow, 'trang cuộn ngang').toBeLessThanOrEqual(0);
}

const PAGES = ['dashboard', 'calendar', 'obligations', 'obligation/vib-1', 'obligation/card-vib', 'cards', 'projection', 'cashflow', 'institutions', 'settings'];

for (const p of PAGES) {
  test(`không tràn ngang: ${p}`, async ({ page }) => {
    await loadExample(page);
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    await page.goto(`/#/${p}`);
    await expect(page.locator('main')).toBeVisible();
    await expectNoOverflow(page);
  });
}

test('không tràn ngang: hộp thoại thêm khoản nợ, ghi nhận thanh toán, sang tháng mới', async ({ page }) => {
  await loadExample(page);
  await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  await page.goto('/#/obligations');
  await page.getByRole('button', { name: '+ Thêm khoản nợ' }).click();
  await expectNoOverflow(page);
  await page.keyboard.press('Escape');

  await page.goto('/#/dashboard');
  await page.locator('tbody tr').filter({ hasText: 'Shinhan khoản 1' }).getByRole('button', { name: 'Ghi nhận' }).click();
  await expectNoOverflow(page);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Sang tháng mới' }).click();
  for (let i = 0; i < 4; i++) {
    await expectNoOverflow(page);
    const next = dialog(page).getByRole('button', { name: 'Tiếp →' });
    if (await next.count()) await next.click();
  }
});
