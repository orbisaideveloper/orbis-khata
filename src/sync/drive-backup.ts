import { registerPlugin } from '@capacitor/core'

const drive = registerPlugin<{ authorize(): Promise<{ token: string }> }>('OrbisDrive')
const api = 'https://www.googleapis.com'
const maximumBytes = 32 * 1024 * 1024 + 128

export async function connectBackupDrive(actor: string) {
  if (!/^[a-f0-9-]{36}$/iu.test(actor)) throw new Error('DRIVE_OWNER_INVALID')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(actor))
  const owner = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const archiveName = 'orbis-khata-financial-v1-' + owner + '.bin'
  const { token } = await drive.authorize()
  if (!token) throw new Error('DRIVE_AUTH_FAILED')
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(api + path, {
      ...init,
      headers: { ...init?.headers, Authorization: 'Bearer ' + token },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) throw new Error('DRIVE_REQUEST_FAILED')
    return response
  }
  return {
    async upload(archive: Uint8Array<ArrayBuffer>) {
      const boundary = 'orbis-' + crypto.randomUUID()
      const metadata = JSON.stringify({ name: archiveName, parents: ['appDataFolder'] })
      const prefix = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + metadata +
        '\r\n--' + boundary + '\r\nContent-Type: application/octet-stream\r\n\r\n'
      await request('/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: new Blob([prefix, archive, '\r\n--' + boundary + '--\r\n']),
      })
    },
    async latest() {
      const filter = new URLSearchParams({
        spaces: 'appDataFolder', q: "trashed = false and name = '" + archiveName + "'",
        orderBy: 'createdTime desc', pageSize: '1', fields: 'files(id,size)',
      })
      const list = await request('/drive/v3/files?' + filter)
      const { files } = await list.json() as { files?: { id: string; size: string }[] }
      const file = files?.[0]
      if (!file || !/^[\w-]+$/u.test(file.id)) throw new Error('DRIVE_BACKUP_NOT_FOUND')
      const expected = Number(file.size)
      if (!Number.isSafeInteger(expected) || expected < 1 || expected > maximumBytes) throw new Error('DRIVE_BACKUP_SIZE_INVALID')
      const response = await request('/drive/v3/files/' + file.id + '?alt=media')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('DRIVE_BACKUP_DOWNLOAD_INVALID')
      const archive = new Uint8Array(expected)
      let offset = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (offset + value.length > expected) throw new Error('DRIVE_BACKUP_DOWNLOAD_INVALID')
          archive.set(value, offset)
          offset += value.length
        }
      } finally {
        await reader.cancel()
      }
      if (offset !== expected) throw new Error('DRIVE_BACKUP_DOWNLOAD_INVALID')
      return archive
    },
  }
}
