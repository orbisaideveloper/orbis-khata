const preview = new URL(self.registration.scope)
const cachePrefix = 'orbis-daily-ledger-preview:' + preview.pathname + ':'
const cacheName = cachePrefix + version
const assets = new Set(files.map(file => new URL(file, preview).href))
const index = new URL('index.html', preview).href

self.addEventListener('install', event => {
  const requests = [...assets].map(url => new Request(url, { credentials: 'omit', cache: 'reload' }))
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(requests)))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key)),
  )))
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.headers.has('authorization')) return
  const url = new URL(event.request.url)
  if (url.origin !== preview.origin || url.search) return
  const rootNavigation = event.request.mode === 'navigate' &&
    (url.pathname === preview.pathname || url.pathname === new URL(index).pathname)
  const asset = rootNavigation ? index : url.href
  if (!assets.has(asset)) return
  event.respondWith(caches.open(cacheName).then(async cache =>
    await cache.match(asset) ?? fetch(asset, { credentials: 'omit' }),
  ))
})
