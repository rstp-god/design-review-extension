/**
 * Static server for the Playwright fixture site (`tests/fixtures/site`).
 *
 * No dependencies on purpose: it must serve the files byte-for-byte. A dev server would inject
 * its HMR client into every page, which breaks the strict-CSP fixture and skews visual snapshots.
 * Started by `webServer` in playwright.config.ts; run it by hand for debugging.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site')
const port = Number(process.env.FIXTURE_PORT ?? 4173)

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

/** Maps a request path to a file under `root`, or `null` when there is none (or it escapes root). */
async function resolveFile(requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://localhost')
  let filePath = path.join(root, path.normalize(decodeURIComponent(pathname)))

  const relative = path.relative(root, filePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null

  try {
    if ((await stat(filePath)).isDirectory()) {
      filePath = path.join(filePath, 'index.html')
      await stat(filePath)
    }
    return filePath
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  const filePath = await resolveFile(req.url ?? '/')

  if (!filePath) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  res.writeHead(200, {
    'content-type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(filePath).pipe(res)
})

server.listen(port, 'localhost', () => {
  process.stdout.write(`Fixture site: http://localhost:${port} → ${root}\n`)
})
