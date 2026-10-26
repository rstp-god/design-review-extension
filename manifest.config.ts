import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }
import { TOGGLE_REVIEW_COMMAND } from './src/shared/constants.ts'

/**
 * Store-facing name and description are localized via `public/_locales` (Chrome resolves the
 * `__MSG_*__` placeholders at install time). `pkg.name` is the internal package id only.
 *
 * Permissions are the four documented in README → Permissions and privacy.html. Adding one changes
 * the install prompt and the store review — do not do it without explicit approval.
 *
 * `e2e: true` is the Playwright build (`VITE_E2E=1`, `dist-e2e/`): Playwright cannot click the
 * extension action, and without that gesture `activeTab` is never granted, so the E2E build gets
 * `host_permissions` for every site. The production manifest must never contain it — a contract
 * test checks both variants.
 */
export function buildManifest(e2e: boolean) {
  return {
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
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage'],
    commands: {
      [TOGGLE_REVIEW_COMMAND]: {
        suggested_key: { default: 'Alt+Shift+R' },
        description: '__MSG_cmdToggleReview__',
      },
    },
    ...(e2e ? { host_permissions: ['<all_urls>'] } : {}),
  }
}

export default defineManifest(buildManifest(process.env.VITE_E2E === '1'))
