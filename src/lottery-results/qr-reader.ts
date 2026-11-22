import { BrowserQRCodeReader } from '@zxing/browser'

/** Decode the visible central target first, then allow a QR elsewhere in the frame. */
export class TicketQrReader extends BrowserQRCodeReader {
  override decodeFromCanvas(canvas: HTMLCanvasElement) {
    const side = Math.floor(Math.min(canvas.width, canvas.height) * 0.7)
    const target = document.createElement('canvas')
    target.width = side
    target.height = side
    const context = target.getContext('2d')
    if (context && side > 0) {
      context.drawImage(canvas, (canvas.width - side) / 2, (canvas.height - side) / 2, side, side, 0, 0, side, side)
      try { return super.decodeFromCanvas(target) }
      catch { /* A moving QR can be outside the guide: try the full frame too. */ }
    }
    return super.decodeFromCanvas(canvas)
  }
}
