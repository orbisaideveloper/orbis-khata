import { afterEach, expect, it, vi } from 'vitest'
import { TicketQrReader } from './qr-reader'
const decoder = vi.hoisted(() => vi.fn())
vi.mock('@zxing/browser', () => ({ BrowserQRCodeReader: class { decodeFromCanvas(canvas: HTMLCanvasElement) { return decoder(canvas) } } }))
afterEach(() => { vi.restoreAllMocks(); decoder.mockReset() })

it('tries the central camera guide and falls back to the complete image', () => {
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  const frame = document.createElement('canvas')
  frame.width = 1920; frame.height = 1080
  const result = { getText: () => 'ticket' }
  decoder.mockImplementationOnce(() => { throw new Error('not found') }).mockReturnValueOnce(result)
  expect(new TicketQrReader().decodeFromCanvas(frame)).toBe(result)
  expect(drawImage).toHaveBeenCalledWith(frame, 582, 162, 756, 756, 0, 0, 756, 756)
  expect(decoder.mock.calls[1][0]).toBe(frame)
})

it('returns a centered match directly and supports canvas context failure', () => {
  const frame = document.createElement('canvas')
  frame.width = 100; frame.height = 100
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
  const result = { getText: () => 'ticket' }
  decoder.mockReturnValue(result)
  expect(new TicketQrReader().decodeFromCanvas(frame)).toBe(result)
  expect(decoder).toHaveBeenCalledOnce()
  decoder.mockClear(); context.mockReturnValue(null)
  expect(new TicketQrReader().decodeFromCanvas(frame)).toBe(result)
  expect(decoder).toHaveBeenCalledWith(frame)
})
