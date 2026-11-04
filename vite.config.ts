import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { serviceWorker } from './pwa/vitePluginSw.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
