export type View = 'welcome' | 'login' | 'workspace' | 'khata'

export function resolveKhataView(next: unknown, signedIn: boolean, guestEnabled: boolean, guestEntered: boolean): View {
  if (next === 'welcome' || next === 'login') return next
  if (!signedIn && !(guestEnabled && guestEntered)) return 'welcome'
  return next === 'workspace' || next === 'khata' ? next : 'welcome'
}
