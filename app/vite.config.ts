import { configDefaults, defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import packageJson from './package.json' with { type: 'json' };
import { buildKairosServiceWorker, listKairosPublicPrecacheFiles } from './src/pwa/serviceWorkerBuild.ts';

/** Emits `sw.js` for each build, with that build's own file list and cache name. */
function kairosServiceWorkerPlugin(): Plugin {
  let root = '';
  let publicDir = '';
  let buildId = 'dev-local';
  return {
    name: 'kairos-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
      buildId = String(config.env.VITE_BUILD_ID ?? '').trim() || 'dev-local';
    },
    async generateBundle(_options, bundle) {
      const bundleFiles = Object.values(bundle).map((item) => ({
        fileName: item.fileName,
        content: item.type === 'chunk' ? item.code : item.source,
      }));
      const index = bundleFiles.find((file) => file.fileName === 'index.html');
      if (!index || typeof index.content !== 'string') throw new Error('The build has no index.html for the service worker.');
      const indexHtml = index.content;
      const publicFiles = await Promise.all(listKairosPublicPrecacheFiles(indexHtml).map(async (fileName) => ({
        fileName,
        content: await this.fs.readFile(`${publicDir}/${fileName}`),
      })));
      const template = await this.fs.readFile(`${root}/src/pwa/serviceWorker.js`, { encoding: 'utf8' });
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: buildKairosServiceWorker(template, { buildId, files: [...bundleFiles, ...publicFiles] }).source,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), kairosServiceWorkerPlugin()],
  define: {
    __KAIROS_APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/testing/setup.ts',
    restoreMocks: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
