/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `'1'` in the Playwright build (`yarn build:e2e`), unset otherwise. */
  readonly VITE_E2E?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
