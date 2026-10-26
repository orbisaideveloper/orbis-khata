import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/** Render locally so Bengali/Hindi shaping and the selected paper design survive sharing. */
export async function createBillPdf(sheets: HTMLElement[], name: string): Promise<File> {
  if (!sheets.length) throw new Error('BILL_PREVIEW_REQUIRED')
  await document.fonts?.ready
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  async function append(index: number): Promise<void> {
    const sheet = sheets[index]
    const canvas = await html2canvas(sheet, {
      scale: 1.5, backgroundColor: '#ffffff', logging: false, allowTaint: false,
      width: 720, height: sheet.offsetHeight, windowWidth: 1000,
      onclone: (_document, element) => { element.style.zoom = '1'; element.style.boxShadow = 'none'; element.style.margin = '0' },
    })
    if (index > 0) pdf.addPage()
    const width = Math.min(190, 277 * canvas.width / canvas.height)
    const height = width * canvas.height / canvas.width
    pdf.addImage(canvas.toDataURL('image/jpeg', .94), 'JPEG', (210 - width) / 2, 10, width, height)
    canvas.width = 0
    canvas.height = 0
    if (index + 1 < sheets.length) await append(index + 1)
  }
  await append(0)
  const filename = name.replace(/[^\p{L}\p{M}\p{N}._-]/gu, '-').slice(0, 100) || 'bill'
  return new File([pdf.output('arraybuffer')], filename + '.pdf', { type: 'application/pdf' })
}
