import type { ReactNode } from 'react'
import type { Language } from '../i18n'
import { Accounting } from '../accounting/Accounting'
export function CompanyGate({ userId, language, children }: {
  userId?: string; language: Language; children: ReactNode
}) {
  return userId ? <Accounting key={userId} userId={userId} language={language} /> : children
}
