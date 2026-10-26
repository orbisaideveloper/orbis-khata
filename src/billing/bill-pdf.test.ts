import { afterEach, expect, it, vi } from 'vitest'
import { createBillPdf } from './bill-pdf'
const mocks = vi.hoisted(() => ({ render: vi.fn(), addImage: vi.fn(), addPage: vi.fn(), output: vi.fn(() => new ArrayBuffer(8)) }))
vi.mock('html2canvas', () => ({ default: mocks.render }))
vi.mock('jspdf', () => ({ jsPDF: class { addImage = mocks.addImage; addPage = mocks.addPage; output = mocks.output } }))
afterEach(() => { vi.clearAllMocks() })
it('rejects an absent preview instead of exporting a blank document', async () => {
  await expect(createBillPdf([], 'bill')).rejects.toThrow('BILL_PREVIEW_REQUIRED')
})
it('renders every paper page locally with its full proportions and a safe PDF filename', async () => {
  mocks.render.mockImplementation(async (_element: HTMLElement, options: { onclone: (document: Document, element: HTMLElement) => void }) => {
    options.onclone(document, document.createElement('article'))
    return { width: 1080, height: 1440, toDataURL: () => 'data:image/jpeg;base64,AA==' }
  })
  const file = await createBillPdf([document.createElement('article'), document.createElement('article')], 'দোকান/1')
  expect(file.name).toBe('দোকান-1.pdf'); expect(file.type).toBe('application/pdf')
  expect(mocks.addPage).toHaveBeenCalledOnce(); expect(mocks.addImage).toHaveBeenCalledTimes(2)
  expect(mocks.render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ allowTaint: false, logging: false, width: 720 }))
})
