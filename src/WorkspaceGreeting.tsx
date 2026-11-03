import { useEffect, useState } from 'react'
import { authClient } from './auth/client'
import { requestAccountProfile } from './profile/common-profile'
import { translations, type Language } from './i18n'

/** Presentation only: names come from the signed-in identity's central profile. */
export function WorkspaceGreeting({ userId, language }: Readonly<{ userId: string | null; language: Language }>) {
  const [profile, setProfile] = useState<{ owner: string; name: string } | null>(null)
  useEffect(() => {
    if (!userId || !authClient) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    void requestAccountProfile(() => authClient!.auth.getSession(), userId, controller.signal)
      .then(result => {
        if (!controller.signal.aborted && result.customer.orbisIdentityId === userId) {
          setProfile({ owner: userId, name: result.profile.name.trim() })
        }
      }).catch(() => { /* A missing name must never block module navigation. */ })
      .finally(() => clearTimeout(timeout))
    return () => { controller.abort(); clearTimeout(timeout) }
  }, [userId])
  const name = profile?.owner === userId ? profile.name : ''
  const welcome = { bn: 'স্বাগতম', hi: 'स्वागत है', en: 'Welcome' }[language]
  return <h1>{name ? <>{welcome}, <span className="workspace-name">{name}</span> <span aria-hidden="true">👋</span></> : translations[language].hi}</h1>
}
