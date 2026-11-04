import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { serviceWorker } from './pwa/vitePluginSw.ts';

export default defineConfig({
  // Đường dẫn tương đối: chạy được ở /<tên-repo>/ trên GitHub Pages lẫn ở gốc domain
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
