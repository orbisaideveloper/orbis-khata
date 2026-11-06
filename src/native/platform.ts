import { Capacitor } from '@capacitor/core'

export const isNativeApp = () => Capacitor.isNativePlatform()

// Recovery completes on the existing HTTPS website, then the owner signs in again
// in Android. Never email an unusable https://localhost recovery link.
export function recoveryRedirect() {
  return isNativeApp() ? 'https://orbis-khata.onrender.com/' : window.location.origin + '/'
}
