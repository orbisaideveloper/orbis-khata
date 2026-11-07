import { khataPwa } from './pwa/build.js'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), khataPwa()],
  define: {
    'import.meta.env.VITE_KHATA_ANDROID_RELEASE': JSON.stringify(`${process.env.KHATA_ANDROID_VERSION_NAME || '1.0.0'} (${process.env.KHATA_ANDROID_VERSION_CODE || '1'})`),
    'import.meta.env.VITE_KHATA_WEB_RELEASE': JSON.stringify((process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || 'local').slice(0, 12)),
  },
})
