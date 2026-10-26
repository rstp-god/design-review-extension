import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

/**
 * Store-facing name and description are localized via `public/_locales` (Chrome resolves the
 * `__MSG_*__` placeholders at install time). `pkg.name` is the internal package id only.
 *
 * No `permissions` yet: `feature/extension-shell` adds `activeTab`, `scripting`, `storage` and
 * `unlimitedStorage` (see README → Permissions). Icons arrive with `feature/store-release`.
 */
export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extName__',
  short_name: 'Design Review',
  description: '__MSG_extDescription__',
  default_locale: 'en',
  version: pkg.version,
  homepage_url: 'https://github.com/rstp-god/design-review-extension',
  action: {
    default_title: '__MSG_extActionTitle__',
    default_popup: 'src/popup/index.html',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module' as const,
  },
})
