import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const path = new URL('../../dist-daily-ledger-preview/', import.meta.url)
const scope = new URL('https://preview.test/daily/')
const listeners = new Map()
const removed = []
const siblingCache = 'orbis-daily-ledger-preview:/other/:previous'
const previousCache = 'orbis-daily-ledger-preview:/daily/:previous'
const entries = new Map()
let installedCache
const cache = {
  async addAll(requests) {
    for (const request of requests) {
      assert.equal(request.credentials, 'omit')
      const url = new URL(request.url)
      assert.ok(url.href.startsWith(scope.href))
      const name = url.pathname.slice(scope.pathname.length)
      entries.set(request.url, readFileSync(new URL(name, path)))
    }
  },
  async match(url) { return entries.get(url) },
}

runInNewContext(readFileSync(new URL('daily-ledger-preview-sw.js', path), 'utf8'), {
  self: { registration: { scope: scope.href }, addEventListener: (type, handler) => listeners.set(type, handler) },
  URL, Request, caches: {
    open: async name => { installedCache = name; return cache },
    keys: async () => [previousCache, installedCache, siblingCache, 'orbis-khata-shell'],
    delete: async name => removed.push(name),
  },
  fetch: async () => { throw new Error('Offline') },
})

async function lifecycle(type) {
  let lifetime
  listeners.get(type)({ waitUntil: action => { lifetime = action } })
  assert.ok(lifetime)
  await lifetime
}

function request(href, { method = 'GET', mode = 'navigate', headers = {} } = {}) {
  let response
  listeners.get('fetch')({
    request: { url: new URL(href, scope).href, method, mode, headers: new Headers(headers) },
    respondWith: result => { response = result },
  })
  return response
}

await lifecycle('install')
await lifecycle('activate')
assert.deepEqual(removed, [previousCache])
const html = await request('./')
assert.ok(html)
assert.equal(html.toString(), readFileSync(new URL('index.html', path), 'utf8'))
assert.ok(html.includes("connect-src 'none'"))
assert.ok(entries.has(new URL('manifest.webmanifest', scope).href))
assert.ok(entries.size > 5)
for (const [url, bytes] of entries) assert.deepEqual(await request(url, { mode: 'cors' }), bytes)
for (const url of ['/api/books', '/sw.js', '/other/', 'https://identity.test/auth', './?session=test']) {
  assert.equal(request(url), undefined)
}
assert.equal(request('./', { method: 'POST' }), undefined)
assert.equal(request('./', { headers: { authorization: 'test-only' } }), undefined)
console.log('PASS: built Daily Ledger worker precaches only static preview files, serves offline shell, bypasses auth/API, and isolates cache cleanup')
