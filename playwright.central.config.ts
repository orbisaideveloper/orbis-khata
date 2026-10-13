import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-central', fullyParallel: false, workers: 1, retries: 0,
  timeout: 30_000, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4187', trace: 'retain-on-failure' },
  projects: [
    { name: 'central-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'central-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187', reuseExistingServer: false, timeout: 60_000,
    env: { VITE_ORBIS_CUSTOMER_API_URL: 'https://admin.example.test', VITE_KHATA_DATA_URL: 'https://data.example.test/khata', VITE_KHATA_GUEST_UI: 'false' },
  },
})
