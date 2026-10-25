export type View = 'welcome' | 'login' | 'workspace' | 'khata' | 'profile'

export function resolveKhataView(next: unknown, signedIn: boolean, guestEnabled: boolean, guestEntered: boolean): View {
  if (next === 'welcome' || next === 'login') return next
  if (!signedIn && !(guestEnabled && guestEntered)) return 'welcome'
  if (next === 'profile') return signedIn ? 'profile' : 'welcome'
  return next === 'workspace' || next === 'khata' ? next : 'welcome'
}
