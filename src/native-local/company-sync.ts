import { useEffect, useState } from 'react'
import { readOnlineCompanyExport } from '../accounting/api'

const pending = new Map<string, Promise<{ changed: boolean; syncedAt: string }>>()

export function syncWebCompany(actor: string, company: string) {
  const key = actor + ':' + company
  const existing = pending.get(key)
  if (existing) return existing
  const task = (async () => {
    const runtime = await import('./runtime')
    const payload = await readOnlineCompanyExport(actor, company)
    const result = await runtime.syncNativeCompany(actor, company, payload)
    if (result.changed) {
      window.dispatchEvent(new Event('khata-refresh'))
      window.dispatchEvent(new Event('khata-company-synced'))
    }
    return result
  })().finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}

export function useNativeCompanySync(actor: string | null) {
  const [conflict, setConflict] = useState<{ actor: string; id: string; name: string }>()
  useEffect(() => {
    if (!actor) return
    let active = true
    let running = false
    const sync = async () => {
      if (!active || running || !navigator.onLine || document.visibilityState === 'hidden') return
      running = true
      try {
        const { readNativeSyncCompanies } = await import('./runtime')
        for (const company of await readNativeSyncCompanies(actor)) {
          if (!active) break
          try {
            await syncWebCompany(actor, company.id)
            if (active) setConflict(current => current?.actor === actor && current.id === company.id ? undefined : current)
          } catch (error) {
            if (active && error instanceof Error && error.message === 'KHATA_COMPANY_SYNC_CONFLICT') {
              setConflict({ actor, id: company.id, name: company.name })
            }
          }
        }
      } catch {
        // An offline lock or a changed account can interrupt a foreground pull.
      } finally {
        running = false
      }
    }
    void sync()
    const interval = window.setInterval(() => void sync(), 120_000)
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [actor])
  return conflict?.actor === actor ? conflict.name : undefined
}
