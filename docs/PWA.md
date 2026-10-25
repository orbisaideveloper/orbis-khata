# PWA shell and cache — owner-approved, source only

The production build includes a standalone web manifest and a service worker.
After the first successful online visit and worker installation, closing and
reopening the app allows its static screens to load from the device cache.
Chrome Android: menu → Install app (or Add to Home screen → Install, depending
on the browser). This is not an APK. Browser eligibility still needs phone testing.

Only exact build-owned assets, root HTML, manifest and icon are precached.
No customer API, financial response, token, query URL, cross-origin request,
POST or authorized request is cached. Existing central login verification and
gateway authorization are retained; books and new saves still need a connection.
There is no offline financial queue or local read-only books snapshot in this slice.
The offline notice is Bengali/English/Hindi. Failed reports remain unavailable,
not fabricated zero balances. Existing uncertain-bill recovery is retained.

Worker/cache version derives from the actual output and public PWA files.
Installation fails atomically if any required shell asset cannot be downloaded.
Old versions wait until all old windows close; no forced reload/skipWaiting.
The notice asks the owner to finish pending work before closing app windows.
Only obsolete caches with this product's own prefix are removed on activation.
Queries (including recovery tokens) always bypass the worker.

Validation: built-worker VM check runs in every build; mobile and desktop
Playwright exercise production preview online → worker control → offline reload
→ online notice removal. Unit tests cover connection notices, registration,
update notification and failure. Real browser/phone install and release gates
must pass before claiming a production PWA. This change does not establish the
cause of the reported 20-second server delay or remove central-service cold starts.

Deployment review: Render static header rules should use Cache-Control: no-cache
for /sw.js, /index.html and /manifest.webmanifest; hashed /assets/* may be immutable.
These are Render Dashboard rules, not a Netlify _headers file. Existing AutoDeploy
remains OFF. No Render settings or production data were changed by this source patch.
