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

/**
 * Maps a request to `{ filePath }` for a file under `root`, `{ redirect }` for a directory
 * requested without a trailing slash, or `null` when nothing matches (including bad escapes
 * and paths that would escape `root`).
 */
async function resolveTarget(requestUrl) {
  try {
    const { pathname } = new URL(requestUrl, 'http://localhost')
    let filePath = path.join(root, path.normalize(decodeURIComponent(pathname)))

    const relative = path.relative(root, filePath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null

    if ((await stat(filePath)).isDirectory()) {
      // Relative URLs inside index.html resolve against the directory only with a trailing slash.
      if (!pathname.endsWith('/')) return { redirect: `${pathname}/` }
      filePath = path.join(filePath, 'index.html')
      await stat(filePath)
    }

    return { filePath }
  } catch {
    return null
  }
}

function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(text)
}

const server = createServer(async (req, res) => {
  const target = await resolveTarget(req.url ?? '/')

  if (!target) {
    sendText(res, 404, 'Not found')
    return
  }

  if (target.redirect) {
    res.writeHead(301, { location: target.redirect })
    res.end()
    return
  }

  const stream = createReadStream(target.filePath)

  stream.once('open', () => {
    res.writeHead(200, {
      'content-type': mimeTypes[path.extname(target.filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    stream.pipe(res)
  })

  stream.on('error', () => {
    // The file vanished or became unreadable between `stat` and `open`.
    if (res.headersSent) {
      res.destroy()
      return
    }
    sendText(res, 500, 'Read error')
  })
})

server.listen(port, 'localhost', () => {
  process.stdout.write(`Fixture site: http://localhost:${port} → ${root}\n`)
})
