import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { extractTwPropertyInitials, TW_FALLBACK_SELECTOR } from '@/content/styles/twFallbacks'
import { CONTENT_SCRIPT_FILE } from '@/shared/constants'

/** Vitest runs from the repository root. */
const repoRoot = process.cwd()

/**
 * Upper bound for `content.js`, uncompressed, in Vite's kB (1000 bytes). The overlay is injected
 * into a live page on every start; a heavier bundle means a slower start and more to parse on the
 * host page. Raise it deliberately, with a reason, not because a dependency crept in.
 *
 * Measured 429 374 bytes after feature 4 (page snapshot), budget = measured + 30 kB. The feature
 * added 49.8 kB: 19.3 kB of @floating-ui/react that the toolbar menu brings in (list navigation,
 * focus management, click / role hooks), 12.6 kB of snapshot code (walk, rank, visibility,
 * capture, controller), 5.6 kB of overlay UI (countdown, badge, layer, toast, menu wiring),
 * 4 kB of Tailwind classes, the rest in the picker source and messaging. Before the feature:
 * 379 623 bytes (`yarn bundle:report` shows the composition).
 */
const CONTENT_SCRIPT_BUDGET_BYTES = 460_000
const distDir = path.join(repoRoot, 'dist')

function hasProductionBuild(): boolean {
  return (
    existsSync(path.join(distDir, 'manifest.json')) &&
    existsSync(path.join(distDir, CONTENT_SCRIPT_FILE))
  )
}

/** Same two Vite builds as `yarn build`, without the type check. */
function buildProduction(): void {
  const vite = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const env = { ...process.env, VITE_E2E: '' }
  execFileSync(process.execPath, [vite, 'build'], { cwd: repoRoot, env, stdio: 'ignore' })
  execFileSync(process.execPath, [vite, 'build', '-c', 'vite.content.config.ts'], {
    cwd: repoRoot,
    env,
    stdio: 'ignore',
  })
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
}

/**
 * Checks the production artifact itself, not the sources: `dist/` must contain neither the E2E
 * hook nor host permissions, and the overlay CSS inside `content.js` must survive a shadow root
 * on a page with a non-default root font size.
 *
 * Uses the existing `dist/` when there is one (local runs after `yarn build`); otherwise builds
 * it first (CI runs Vitest before the build).
 */
describe('contract: production bundle', () => {
  let contentScript = ''

  beforeAll(() => {
    if (!hasProductionBuild()) buildProduction()
    contentScript = readFileSync(path.join(distDir, CONTENT_SCRIPT_FILE), 'utf8')
  }, 120_000)

  it('manifest.json has no host permissions', () => {
    const manifest = JSON.parse(readFileSync(path.join(distDir, 'manifest.json'), 'utf8'))
    expect(manifest.host_permissions).toBeUndefined()
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage', 'unlimitedStorage'])
  })

  it('no file mentions the E2E hook', () => {
    const offenders = listFiles(distDir).filter((file) => {
      if (!/\.(js|mjs|html|json|css)$/.test(file)) return false
      return readFileSync(file, 'utf8').includes('__drE2E')
    })
    expect(offenders).toEqual([])
  })

  it('content script stays within its size budget', () => {
    const size = Buffer.byteLength(contentScript, 'utf8')
    expect(
      size,
      `content.js is ${size} bytes, the budget is ${CONTENT_SCRIPT_BUDGET_BYTES}`,
    ).toBeLessThanOrEqual(CONTENT_SCRIPT_BUDGET_BYTES)
  })

  it('content script uses no rem units', () => {
    expect(contentScript).not.toMatch(/\d*\.?\d+rem\b/)
  })

  it('content script registers --tw-* properties and bundles the runtime fallback for them', () => {
    // The fallback rule itself is generated in the page from this very CSS (content/host.ts);
    // here we check that the generator understands the minified output and is part of the bundle.
    const registered = extractTwPropertyInitials(contentScript)
    expect(registered.length).toBeGreaterThan(0)
    for (const [name, value] of registered) {
      expect(name).toMatch(/^--tw-/)
      expect(value).not.toBe('')
    }
    expect(contentScript).toContain(TW_FALLBACK_SELECTOR)
  })

  it('content script is a production React build without bundled fonts', () => {
    expect(contentScript).not.toContain('process.env.NODE_ENV')
    expect(contentScript).not.toMatch(/\.woff2?\b/)
  })

  it('content script carries neither i18next nor the classic zod build', () => {
    // The overlay translates with i18n/lite.ts and validates with zod/mini; both libraries
    // would come back silently through one `import { useTranslation }` or `import { z }`.
    expect(contentScript).not.toContain('i18next')
    expect(contentScript).not.toMatch(/toJSONSchema|json-schema/i)
  })

  it('content script carries no E2E observation surface', () => {
    expect(contentScript).not.toMatch(/dr-e2e/)
  })

  it('no file runs code in the main world of a page', () => {
    const offenders = listFiles(distDir).filter((file) => {
      if (!/\.(js|mjs)$/.test(file)) return false
      return /world\s*:\s*["']MAIN["']/.test(readFileSync(file, 'utf8'))
    })
    expect(offenders).toEqual([])
  })
})
