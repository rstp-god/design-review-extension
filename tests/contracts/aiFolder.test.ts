import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Vitest runs from the repository root. */
const repoRoot = process.cwd()

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

/**
 * `.ai/` holds private planning docs (spec, task breakdown). They must never reach the
 * repository: the folder is git-ignored, the ignore rule actually applies, and nothing under
 * it is in the index.
 */
describe('contract: .ai/ stays private', () => {
  it('.gitignore lists .ai/', () => {
    const lines = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
    expect(lines).toContain('.ai/')
  })

  it('git ignores paths under .ai/', () => {
    // `check-ignore -q` exits 1 (and execFileSync throws) when the path is NOT ignored.
    expect(() => git('check-ignore', '-q', '.ai/spec.md')).not.toThrow()
  })

  it('nothing under .ai/ is tracked', () => {
    expect(git('ls-files', '--cached', '--', '.ai')).toBe('')
  })
})
