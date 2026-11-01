import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Limit parallel jsdom instances on Android/Termux.
    maxWorkers: 2,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Imported vendor/**/src is outside sonar.sources=src; keep the same first-party coverage boundary.
        // Its changed behavior is exercised by tests/lottery and workspace integration tests.
        '**/vendor/**',
        'src/main.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/vite-env.d.ts',
      ],
      reporter: ['text', 'lcov', 'json-summary'],
      reportOnFailure: true,
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
})
