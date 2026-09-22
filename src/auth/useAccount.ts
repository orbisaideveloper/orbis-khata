import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { authClient } from './client'

export function useAccount() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(authClient))
  const [recovery, setRecovery] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    if (!authClient) return
    let alive = true
    let observed = false
    const timeout = window.setTimeout(() => {
      if (alive && !observed) { setUnavailable(true); setLoading(false) }
    }, 15000)
    const { data } = authClient.auth.onAuthStateChange((event, next) => {
      if (!alive) return
      observed = true
      window.clearTimeout(timeout)
      setSession(next)
      setLoading(false)
      setUnavailable(false)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    void authClient.auth.getSession().then(({ data: initial, error }) => {
      if (!alive || observed) return
      window.clearTimeout(timeout)
      setSession(initial.session)
      setUnavailable(Boolean(error))
      setLoading(false)
    }).catch(() => {
      window.clearTimeout(timeout)
      if (alive && !observed) { setUnavailable(true); setLoading(false) }
    })
    return () => { alive = false; window.clearTimeout(timeout); data.subscription.unsubscribe() }
  }, [])
  return { session, loading, recovery, setRecovery, unavailable }
}
