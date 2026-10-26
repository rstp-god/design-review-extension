import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { CONTENT_SCRIPT_FILE } from './src/shared/constants.ts'

/**
 * Builds the content script as ONE self-contained IIFE (`dist/content.js`), separately from the
 * crxjs build in vite.config.ts.
 *
 * Why not crxjs's `?script&iife`: its child build runs with `plugins: []`, so Tailwind never
 * processes the overlay stylesheet. The ESM `?script` loader would need `web_accessible_resources`
 * for every site and a dynamic `import()` that is subject to the page's CSP. A plain lib build
 * gives us Tailwind, React and the CSS (imported with `?inline`) in a single file that the
 * background injects with `chrome.scripting.executeScript({ files: [CONTENT_SCRIPT_FILE] })` —
 * no web-accessible resources, no page-level script tags.
 *
 * `VITE_E2E=1` only changes the output directory (`dist-e2e/`), in step with vite.config.ts.
 */
const isE2E = process.env.VITE_E2E === '1'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  plugins: [tailwindcss()],
  build: {
    outDir: isE2E ? 'dist-e2e' : 'dist',
    // The crxjs build empties the directory first; this one only adds `content.js` to it.
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/content/index.tsx'),
      formats: ['iife'],
      name: 'drContent',
      fileName: () => CONTENT_SCRIPT_FILE,
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
