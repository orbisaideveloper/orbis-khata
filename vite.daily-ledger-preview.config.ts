import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, normalizePath, type Plugin } from 'vite'

const root = fileURLToPath(new URL('./preview/daily-ledger/', import.meta.url))
const source = normalizePath(fileURLToPath(new URL('./src/', import.meta.url)))
const publicFiles = ['daily-ledger-preview-icon.svg', 'manifest.webmanifest']

function previewBoundary(): Plugin {
  return {
    name: 'daily-ledger-preview-boundary',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const allowed = new Set(['accounting/model.ts', 'index.css', ...[
        'DailyLedger.tsx', 'budget.ts', 'copy.ts', 'daily-ledger.css', 'journal.ts', 'household.ts', 'HouseholdPanel.tsx',
      ].map(name => 'daily-ledger/' + name)])
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        for (const id of output.moduleIds) {
          if (id.startsWith(source) && !allowed.has(id.slice(source.length))) {
            this.error('Module is outside the Daily Ledger preview boundary: ' + id.slice(source.length))
          }
        }
      }
      const files = Object.keys(bundle).sort()
      const worker = readFileSync(root + 'service-worker.js', 'utf8')
      const digest = createHash('sha256').update(worker)
      for (const name of files) {
        const output = bundle[name]
        digest.update(name).update(output.type === 'chunk' ? output.code : output.source)
      }
      for (const name of publicFiles) digest.update(name).update(readFileSync(root + 'public/' + name))
      const version = digest.digest('hex')
      const precache = [...new Set(['index.html', ...publicFiles, ...files])]
      this.emitFile({
        type: 'asset',
        fileName: 'daily-ledger-preview-sw.js',
        source: 'const version = ' + JSON.stringify(version) + '\nconst files = ' + JSON.stringify(precache) + '\n' + worker,
      })
    },
  }
}

export default defineConfig({
  root,
  base: './',
  envDir: false,
  plugins: [react(), previewBoundary()],
  build: {
    outDir: fileURLToPath(new URL('./dist-daily-ledger-preview/', import.meta.url)),
    emptyOutDir: true,
  },
})
