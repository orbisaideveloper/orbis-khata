import { afterEach, expect, it, vi } from 'vitest'
import { canShareFile, shareCancelled, shareFile } from './share-file'
const mocks = vi.hoisted(() => ({ native: vi.fn(() => false), write: vi.fn(), share: vi.fn() }))
vi.mock('./platform', () => ({ isNativeApp: mocks.native }))
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { writeFile: mocks.write } }))
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); mocks.native.mockReturnValue(false) })
it('preserves the web file-sharing API and unsupported fallback', async () => {
  const file = new File(['content'], 'bill.pdf'), share = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { share, canShare: () => true })
  expect(canShareFile(null)).toBe(false)
  expect(canShareFile(file)).toBe(true)
  await shareFile(file, 'Bill')
  expect(share).toHaveBeenCalledWith({ files: [file], title: 'Bill' })
  vi.stubGlobal('navigator', {})
  expect(canShareFile(file)).toBe(false)
  vi.stubGlobal('navigator', { share })
  expect(canShareFile(file)).toBe(false)
  expect(mocks.write).not.toHaveBeenCalled()
})
it('shares exact bytes from isolated private cache without browser APIs', async () => {
  mocks.native.mockReturnValue(true)
  mocks.write.mockResolvedValue({ uri: 'file:///cache/shares/document.pdf' })
  mocks.share.mockResolvedValue({})
  const file = new File(['PDF'], '../bill.pdf', { type: 'application/pdf' })
  expect(canShareFile(file)).toBe(true)
  await shareFile(file, 'Bill')
  expect(mocks.write).toHaveBeenCalledWith({ path: expect.stringMatching(/^shares\/[\da-f-]+\/..-bill.pdf$/u), data: 'UERG', directory: 'CACHE', recursive: true })
  expect(mocks.share).toHaveBeenCalledWith({ title: 'Bill', files: ['file:///cache/shares/document.pdf'] })
})
it('propagates storage failures without opening a share chooser', async () => {
  mocks.native.mockReturnValue(true)
  mocks.write.mockRejectedValueOnce(new Error('Disk full'))
  await expect(shareFile(new File(['x'], 'x.pdf'), 'Bill')).rejects.toThrow('Disk full')
  expect(mocks.share).not.toHaveBeenCalled()
})
it('distinguishes cancellation from a real share error', () => {
  expect(shareCancelled(new DOMException('', 'AbortError'))).toBe(true)
  expect(shareCancelled(Object.assign(new Error('cancel'), { name: 'AbortError' }))).toBe(true)
  expect(shareCancelled({ name: 'AbortError' })).toBe(true)
  expect(shareCancelled(new Error('Share canceled'))).toBe(true)
  expect(shareCancelled(new Error('No target'))).toBe(false)
  expect(shareCancelled(null)).toBe(false)
  expect(shareCancelled({})).toBe(false)
  expect(shareCancelled('AbortError')).toBe(false)
})
it('keeps native sharing errors visible and handles an empty file name safely', async () => {
  mocks.native.mockReturnValue(true)
  mocks.write.mockResolvedValueOnce({ uri: 'file:///cache/shares/document' })
  mocks.share.mockRejectedValueOnce(new Error('No share target'))
  await expect(shareFile(new File(['x'], ''), 'Bill')).rejects.toThrow('No share target')
  expect(mocks.write.mock.calls[0][0].path).toMatch(/\/document$/u)
})
it.each(['read-error', null, 'not-a-data-url', 'data:application/pdf;base64'])('fails closed before sharing for reader outcome %s', async result => {
  mocks.native.mockReturnValue(true)
  vi.stubGlobal('FileReader', class {
    result = result
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    readAsDataURL() {
      if (result === 'read-error') this.onerror?.()
      else this.onload?.()
    }
  })
  await expect(shareFile(new File(['x'], 'x.pdf'), 'Bill')).rejects.toThrow('FILE_READ_FAILED')
  expect(mocks.write).not.toHaveBeenCalled()
  expect(mocks.share).not.toHaveBeenCalled()
})
