import { isNativeApp } from './platform'

export function canShareFile(file: File | null) {
  return Boolean(file && (isNativeApp() || (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }))))
}

export async function shareFile(file: File, title: string) {
  if (!isNativeApp()) return navigator.share({ files: [file], title })
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'), import('@capacitor/share'),
  ])
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string' || !result.startsWith('data:')) {
        reject(new Error('FILE_READ_FAILED'))
        return
      }
      const comma = result.indexOf(',')
      if (comma < 0) { reject(new Error('FILE_READ_FAILED')); return }
      resolve(result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
  const safeName = file.name.replace(/[^\p{L}\p{M}\p{N}._-]/gu, '-').slice(0, 110) || 'document'
  // Cache is private and excluded from backup. Keep the file after chooser return:
  // the receiving application may still be reading the granted content URI.
  const { uri } = await Filesystem.writeFile({
    path: 'shares/' + crypto.randomUUID() + '/' + safeName,
    data, directory: Directory.Cache, recursive: true,
  })
  await Share.share({ title, files: [uri] })
}

export function shareCancelled(error: unknown) {
  if (!error || typeof error !== 'object') return false
  return ('name' in error && error.name === 'AbortError') ||
    ('message' in error && error.message === 'Share canceled')
}
