import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

/** Only build-owned static files are cached. Auth, API and financial data bypass this worker. */
export function khataPwa(): Plugin {
  return {
    name: 'khata-static-pwa',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter(name => name === 'index.html' || name.startsWith('assets/'))
      const version = createHash('sha256')
      for (const name of ['manifest.webmanifest', 'icon.svg']) {
        version.update(readFileSync(new URL('../public/' + name, import.meta.url)))
      }
      for (const name of files.sort()) {
        const entry = bundle[name]
        version.update(name).update(entry.type === 'chunk' ? entry.code : entry.source)
      }
      const urls = ['/', ...files.map(name => '/' + name), '/manifest.webmanifest', '/icon.svg']
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: workerSource(version.digest('hex').slice(0, 20), urls) })
    },
  }
}

function workerSource(version: string, urls: string[]): string {
  return `const CACHE = ${JSON.stringify('orbis-khata-shell-' + version)};
const FILES = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
// No skipWaiting: updates activate after all old app windows close.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('orbis-khata-shell-') && key !== CACHE)
    .map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      request.headers.has('authorization') || url.search || url.hash) return;
  const navigation = request.mode === 'navigate' && url.pathname === '/';
  if (!navigation && !FILES.includes(url.pathname)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(navigation ? '/' : url.pathname);
    return hit || fetch(request);
  }));
});
`
}
