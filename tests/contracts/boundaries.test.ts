import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = path.join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
}

/** Module specifiers of every static and dynamic import in a file. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specifiers: string[] = []
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specifiers.push(match[1] ?? '')
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1] ?? '')
  }
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    specifiers.push(match[1] ?? '')
  }
  return specifiers
}

function offenders(dir: string, forbidden: RegExp): string[] {
  return sourceFiles(dir)
    .filter((file) => importsOf(file).some((specifier) => forbidden.test(specifier)))
    .map((file) => path.relative(process.cwd(), file))
}

/**
 * Context boundaries from CLAUDE.md: only the background touches IndexedDB, and the overlay on a
 * third-party page must not pull the bundled fonts (Chrome ignores `@font-face` in a shadow root;
 * they would only bloat `content.js`).
 */
describe('contract: context boundaries', () => {
  it('content and popup never import the background database module', () => {
    const db = /background\/db(\.ts)?$/
    expect(offenders(path.join(srcDir, 'content'), db)).toEqual([])
    expect(offenders(path.join(srcDir, 'popup'), db)).toEqual([])
  })

  it('content never imports bundled fonts', () => {
    expect(offenders(path.join(srcDir, 'content'), /^@fontsource/)).toEqual([])
  })
})
