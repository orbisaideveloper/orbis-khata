export function phoneHref(phone: string): string | undefined {
  const value = phone.trim()
  return /^[+\d ()-]{6,30}$/u.test(value) && /\d/u.test(value) ? 'tel:' + value.replace(/[ ()-]/gu, '') : undefined
}
