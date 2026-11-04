import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Sinh dist/sw.js từ pwa/sw-template.js với danh sách precache = mọi file build + file trong public/.
 * Phiên bản cache = hash của danh sách đó → mỗi bản build mới tự xoá cache cũ.
 */
export function serviceWorker(): Plugin {
  let publicDir = '';
  return {
    name: 'debt-manager-sw',
    apply: 'build',
    configResolved(c) {
      publicDir = c.publicDir;
    },
    generateBundle(_opts, bundle) {
      const publicFiles = fs.existsSync(publicDir)
        ? fs.readdirSync(publicDir, { recursive: true, withFileTypes: true })
            .filter((e) => e.isFile())
            .map((e) => path.relative(publicDir, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
        : [];
      const files = ['./', ...Object.keys(bundle).filter((f) => !f.endsWith('.map')), ...publicFiles]
        .filter((f) => f !== 'sw.js')
        .map((f) => (f === './' ? f : `./${f}`));
      const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 10);
      const template = fs.readFileSync(path.resolve(import.meta.dirname, 'sw-template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files, null, 2)),
      });
    },
  };
}
