import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
const source = readFileSync('dist/sw.js', 'utf8')
const listeners = {}
let fetches = 0
const removed = []
let installed = []
const cache = { addAll: async files => { installed = files }, match: async path => path === '/' ? 'cached-shell' : undefined }
runInNewContext(source, {
  self: { location: { origin: 'https://khata.test' }, addEventListener: (name, fn) => { listeners[name] = fn } },
  URL, caches: { open: async () => cache, keys: async () => ['other-app', 'orbis-khata-shell-old'], delete: async key => { removed.push(key) } },
  fetch: async () => { fetches++; return 'network' },
})
let work
listeners.install({ waitUntil: promise => { work = promise } }); await work
assert(installed.includes('/') && installed.includes('/index.html'))
listeners.activate({ waitUntil: promise => { work = promise } }); await work
assert.deepEqual(removed, ['orbis-khata-shell-old'])
function request(url, options = {}) {
  let response
  listeners.fetch({ request: { url, method: 'GET', mode: 'navigate', headers: new Headers(), ...options }, respondWith: value => { response = value } })
  return response
}
assert.equal(await request('https://khata.test/'), 'cached-shell')
assert.equal(fetches, 0)
for (const url of ['https://admin.test/api/session', 'https://khata.test/api/books', 'https://khata.test/?token_hash=secret']) assert.equal(request(url), undefined)
assert.equal(request('https://khata.test/', { method: 'POST' }), undefined)
assert.equal(request('https://khata.test/', { headers: new Headers({ authorization: 'Bearer secret' }) }), undefined)
const asset = installed.find(path => path.startsWith('/assets/'))
assert(asset)
assert.equal(await request('https://khata.test' + asset, { mode: 'cors' }), 'network')
assert.equal(fetches, 1)
assert(!source.includes('self.skipWaiting('))
console.log('PASS: built worker install, offline shell, API/auth bypass, own-cache cleanup, safe updates')
