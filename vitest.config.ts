import path from 'node:path'
import { coverageConfigDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@tests': path.resolve(import.meta.dirname, 'tests'),
    },
  },
  test: {
    // Node by default. A file that needs a DOM opts in with `// @vitest-environment jsdom`.
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Keep Vitest's defaults (test files, configs, declarations) and add our entry points:
        // they only wire things together and are exercised by Playwright, not Vitest.
        ...coverageConfigDefaults.exclude,
        'src/**/main.tsx',
        'src/background/index.ts',
        'src/background/e2e.ts',
        'src/content/index.tsx',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
})
