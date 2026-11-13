/** Remove recovery credentials from the address bar before any asynchronous request. */
export function takeRecoveryLink(href: string, clean: (href: string) => void): string | null {
  const url = new URL(href)
  const fragment = new URLSearchParams(url.hash.slice(1))
  const marked = url.searchParams.get('orbis_recovery') === '1'
  const indicated = url.searchParams.get('type') === 'recovery' || fragment.get('type') === 'recovery'
  if (!marked && !indicated) return null
  const hashes = [...url.searchParams.getAll('token_hash'), ...fragment.getAll('token_hash')]
  const hasUnexpectedFragment = [...fragment.keys()].some(key => key !== 'token_hash' && key !== 'type') ||
    (fragment.has('type') && fragment.get('type') !== 'recovery') ||
    (url.searchParams.has('type') && url.searchParams.get('type') !== 'recovery')
  for (const key of ['orbis_recovery', 'token_hash', 'type', 'access_token', 'refresh_token', 'code', 'error', 'error_code', 'error_description']) {
    url.searchParams.delete(key)
  }
  url.hash = ''
  clean(url.href)
  if (!marked || hashes.length !== 1 || !/^[A-Za-z0-9_-]{32,256}$/u.test(hashes[0]) || hasUnexpectedFragment) {
    throw new Error('CENTRAL_RECOVERY_LINK_INVALID')
  }
  return hashes[0]
}
