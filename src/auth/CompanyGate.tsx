import type { ReactNode } from 'react'
import type { Language } from '../i18n'
import { Accounting } from '../accounting/Accounting'
export function CompanyGate({ userId, language, children, workspace }: {
  userId?: string; language: Language; children: ReactNode; workspace?:ReactNode
}) {
  return userId ? workspace??<Accounting key={userId} userId={userId} language={language} /> : children
}
