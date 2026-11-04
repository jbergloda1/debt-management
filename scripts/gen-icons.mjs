// Sinh icon PWA từ SVG bằng Chrome (Playwright). Chạy: node scripts/gen-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/icons');
fs.mkdirSync(OUT, { recursive: true });

const TEAL = '#0d9488';
// Thẻ + dấu tích, nằm trong vùng an toàn 80% để dùng được cho icon maskable
const glyph = `
  <g transform="translate(256 256)">
    <rect x="-150" y="-100" width="300" height="200" rx="28" fill="#fff"/>
    <rect x="-150" y="-52" width="300" height="38" fill="${TEAL}" opacity=".9"/>
    <rect x="-118" y="38" width="96" height="22" rx="11" fill="${TEAL}" opacity=".35"/>
    <circle cx="96" cy="78" r="70" fill="#f59e0b" stroke="${TEAL}" stroke-width="16"/>
    <path d="M62 78 l24 24 l44 -48" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
const svg = (rounded) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
  `<rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${TEAL}"/>${glyph}</svg>`;

fs.writeFileSync(path.join(OUT, 'icon.svg'), svg(true));

const targets = [
  ['icon-192.png', 192, true],
  ['icon-512.png', 512, true],
  ['icon-maskable-512.png', 512, false],
  ['apple-touch-icon.png', 180, false],
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
for (const [file, size, rounded] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(rounded).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.locator('svg').screenshot({ path: path.join(OUT, file), omitBackground: true });
  console.log('✓', file);
}
await browser.close();
