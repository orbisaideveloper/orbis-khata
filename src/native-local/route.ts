/** Android-only local-first route. Never affects the currently deployed Web/PWA. */
import { Capacitor } from '@capacitor/core'
export const androidLocalFirst = (): boolean => Capacitor.getPlatform() === 'android'
