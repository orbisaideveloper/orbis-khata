export type View = 'welcome' | 'login' | 'workspace' | 'khata' | 'profile' | 'drive-backup' | 'lottery' | 'customer' | 'results'

export function resolveKhataView(next: unknown, signedIn: boolean, guestEnabled: boolean, guestEntered: boolean): View {
  if (next === 'welcome' || next === 'login') return next
  if (!signedIn && !(guestEnabled && guestEntered)) return 'welcome'
  if(next==='lottery'||next==='customer'||next==='results')return signedIn?next:'welcome'
  if (next === 'profile' || next === 'drive-backup') return signedIn ? next : 'welcome'
  return next === 'workspace' || next === 'khata' ? next : 'welcome'
}
