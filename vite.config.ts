import path from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import zip from 'vite-plugin-zip-pack'
import manifest from './manifest.config.ts'
import pkg from './package.json' with { type: 'json' }

/**
 * `VITE_E2E=1` produces the Playwright build in `dist-e2e/`. Today it differs from the
 * production build only by its output directory; `feature/extension-shell` adds
 * `host_permissions` and the `__drE2E` test hook on top of it. That build is never zipped —
 * `release/` holds only what goes to the Chrome Web Store.
 */
const isE2E = process.env.VITE_E2E === '1'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@tests': path.resolve(import.meta.dirname, 'tests'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
    !isE2E && zip({ outDir: 'release', outFileName: `design-review-${pkg.version}.zip` }),
  ],
  build: {
    outDir: isE2E ? 'dist-e2e' : 'dist',
    emptyOutDir: true,
  },
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
})
