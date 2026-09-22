import { afterEach, expect, it, vi } from 'vitest'
const createClient = vi.hoisted(() => vi.fn(() => ({ auth: {} })))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks() })
it('enables persisted sessions, automatic refresh and recovery URL handling', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  await import('./client')
  expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
})
it('does not invent a connection when configuration is missing', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
  expect((await import('./client')).authClient).toBeNull()
  expect(createClient).not.toHaveBeenCalled()
})
