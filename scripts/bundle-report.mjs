/**
 * Composition of the content script bundle (`content.js`), by package and by module.
 *
 * Builds the content script in memory with a sourcemap (same config as `yarn build`, nothing is
 * written to `dist/`) and attributes every byte of the minified output to the source it came
 * from. Bytes without a mapping — the overlay CSS string, which the Tailwind plugin emits
 * without a sourcemap — are reported as such.
 *
 *   yarn bundle:report            top 15 modules
 *   yarn bundle:report --top 30
 *
 * The size budget itself lives in tests/contracts/bundle.test.ts.
 */
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { decodedMappings, TraceMap } from '@jridgewell/trace-mapping'
import { build } from 'vite'

const DEFAULT_TOP = 15

function topCount(argv) {
  const index = argv.indexOf('--top')
  const value = index === -1 ? Number.NaN : Number(argv[index + 1])
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TOP
}

function kb(bytes) {
  return `${(bytes / 1000).toFixed(1).padStart(7)} kB`
}

/** `react-dom`, `@floating-ui/react`, `src/content/picker`, or the file itself. */
function groupOf(source) {
  const pkg = source.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)
  if (pkg) return pkg[1]
  const own = source.match(/(?:^|\/)src\/([^/]+(?:\/[^/]+)?)/)
  if (own) return `src/${own[1]}`
  return source
}

/** Bytes of the generated code per original source, from the decoded mappings. */
function bytesBySource(code, map) {
  const lines = code.split('\n')
  const totals = new Map()
  const add = (name, bytes) => totals.set(name, (totals.get(name) ?? 0) + bytes)
  let mapped = 0

  decodedMappings(map).forEach((segments, line) => {
    const lineBytes = Buffer.byteLength(lines[line] ?? '', 'utf8') + 1
    segments.forEach(([column, sourceIndex], index) => {
      const next = segments[index + 1]
      const bytes = Math.max(0, (next ? next[0] : lineBytes) - column)
      const name = sourceIndex === undefined ? null : (map.sources[sourceIndex] ?? null)
      if (name === null) return
      add(name, bytes)
      mapped += bytes
    })
  })

  return { totals, unmapped: Buffer.byteLength(code, 'utf8') - mapped }
}

function sortedEntries(totals) {
  return [...totals].sort((a, b) => b[1] - a[1])
}

async function main() {
  const top = topCount(process.argv.slice(2))
  const result = await build({
    configFile: path.resolve('vite.content.config.ts'),
    logLevel: 'error',
    build: { write: false, sourcemap: true },
  })
  const outputs = Array.isArray(result) ? result : [result]
  const chunk = outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .find((entry) => entry.type === 'chunk' && entry.map)
  if (chunk?.type !== 'chunk' || !chunk.map) {
    throw new Error('the content build produced no chunk with a sourcemap')
  }

  const code = chunk.code
  const total = Buffer.byteLength(code, 'utf8')
  const map = new TraceMap(chunk.map)
  const { totals, unmapped } = bytesBySource(code, map)

  const byGroup = new Map()
  for (const [source, bytes] of totals) {
    const group = groupOf(source)
    byGroup.set(group, (byGroup.get(group) ?? 0) + bytes)
  }
  byGroup.set('(unmapped: overlay CSS string, wrapper)', unmapped)

  const out = []
  out.push(
    `${chunk.fileName}  ${total} bytes (${kb(total).trim()})  gzip ${kb(gzipSync(code).length).trim()}`,
  )
  out.push('', 'By package / area')
  for (const [group, bytes] of sortedEntries(byGroup)) out.push(`  ${kb(bytes)}  ${group}`)
  out.push('', `Top ${top} modules`)
  for (const [source, bytes] of sortedEntries(totals).slice(0, top)) {
    const name = source.replace(/^.*node_modules\//, '').replace(/^(\.\.\/)+/, '')
    out.push(`  ${kb(bytes)}  ${name}`)
  }
  process.stdout.write(`${out.join('\n')}\n`)
}

await main()
