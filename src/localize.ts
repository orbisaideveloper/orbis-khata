import type { Language } from './i18n'

export function inLanguage<T>(language: Language, bn: T, hi: T, en: T): T {
  return { bn, hi, en }[language]
}
