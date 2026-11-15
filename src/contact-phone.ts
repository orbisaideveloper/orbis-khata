import { registerPlugin } from '@capacitor/core'
import { androidLocalFirst } from './native-local/route'

type ContactNavigator = Navigator & {
  contacts?: { select(fields: string[], options: { multiple: boolean }): Promise<{ tel?: string[] }[]> }
}

const nativeContacts = registerPlugin<{ pickPhone(): Promise<{ number?: string }> }>('OrbisKhataOfflineBridge')

export function canChooseContactPhone(): boolean {
  return androidLocalFirst() || Boolean((navigator as ContactNavigator).contacts)
}

export async function chooseContactPhone(): Promise<string | undefined> {
  try {
    if (androidLocalFirst()) return (await nativeContacts.pickPhone()).number?.slice(0, 30)
    const selected = await (navigator as ContactNavigator).contacts?.select(['tel'], { multiple: false })
    return selected?.[0]?.tel?.[0]?.slice(0, 30)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return undefined
    throw error
  }
}
