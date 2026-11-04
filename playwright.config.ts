import { defineConfig } from '@playwright/test';

const DEV = 5174;
// Service worker chỉ đăng ký ở bản build → test PWA chạy trên `vite preview`
const PREVIEW = 5175;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Dùng Chrome đã cài trên máy, không cần `npx playwright install`
    channel: 'chrome',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    viewport: { width: 1360, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'app', testIgnore: /pwa\.spec\.ts/, use: { baseURL: `http://localhost:${DEV}/` } },
    { name: 'pwa', testMatch: /pwa\.spec\.ts/, use: { baseURL: `http://localhost:${PREVIEW}/`, serviceWorkers: 'allow' } },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${DEV} --strictPort`,
      url: `http://localhost:${DEV}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx vite preview --port ${PREVIEW} --strictPort`,
      url: `http://localhost:${PREVIEW}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
