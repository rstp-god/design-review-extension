import { describe, expect, it } from 'vitest'
import { TOGGLE_REVIEW_COMMAND } from '@/shared/constants'
import { buildManifest } from '../../manifest.config'

const APPROVED_PERMISSIONS = ['activeTab', 'scripting', 'storage', 'unlimitedStorage']

/**
 * The manifest decides the install prompt and the store review. Only the four documented
 * permissions, no host permissions in production, and the E2E build differs by `host_permissions`
 * alone (README → E2E build, privacy.html → Permissions).
 */
describe('contract: manifest', () => {
  const production = buildManifest(false)
  const e2e = buildManifest(true)

  it('production requests exactly the approved permissions', () => {
    expect(production.permissions).toEqual(APPROVED_PERMISSIONS)
  })

  it('production has no host permissions', () => {
    expect(production.host_permissions).toBeUndefined()
  })

  it('exposes only the isolated form page to reviewed sites', () => {
    expect(production.web_accessible_resources).toEqual([
      { resources: ['src/issue/index.html'], matches: ['<all_urls>'] },
    ])
  })

  it('declares the global start / stop command with its default shortcut', () => {
    expect(production.commands?.[TOGGLE_REVIEW_COMMAND]).toEqual({
      suggested_key: { default: 'Alt+Shift+R' },
      description: '__MSG_cmdToggleReview__',
    })
  })

  it('E2E build adds <all_urls> host permissions and nothing else', () => {
    expect(e2e.host_permissions).toEqual(['<all_urls>'])
    const { host_permissions: _ignored, ...rest } = e2e
    expect(rest).toEqual(production)
  })
})
