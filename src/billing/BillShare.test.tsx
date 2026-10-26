import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BillShare } from './BillShare'
const create = vi.hoisted(() => vi.fn())
vi.mock('./bill-pdf', () => ({ createBillPdf: create }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); create.mockReset() })
function mount() { return render(<section className="bill-review"><article className="bill-sheet">Bill</article><BillShare language="en" name="Shop-1"/></section>) }
it('prepares a PDF only on request, then shares the file through the device chooser', async () => {
  const file = new File(['PDF'], 'Shop-1.pdf', { type: 'application/pdf' }), share = vi.fn().mockResolvedValue(undefined)
  create.mockResolvedValue(file)
  vi.stubGlobal('navigator', { canShare: () => true, share })
  mount(); expect(create).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Prepare bill PDF' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Share bill' }))
  expect(share).toHaveBeenCalledWith({ files: [file], title: 'Shop-1' })
  expect(create.mock.calls[0][0]).toHaveLength(1)
})
it('offers PDF download when file sharing is unsupported and releases its URL', async () => {
  create.mockResolvedValue(new File(['PDF'], 'Shop-1.pdf', { type: 'application/pdf' }))
  vi.stubGlobal('navigator', {})
  const createObjectURL = vi.fn(() => 'blob:bill'), revokeObjectURL = vi.fn(), click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Prepare bill PDF' }))
  const download = await screen.findByRole('button', { name: 'Download PDF' })
  vi.useFakeTimers(); fireEvent.click(download); expect(click).toHaveBeenCalledOnce()
  vi.runAllTimers(); expect(revokeObjectURL).toHaveBeenCalledWith('blob:bill'); vi.useRealTimers()
  expect(screen.queryByRole('button', { name: 'Share bill' })).not.toBeInTheDocument()
})
it('keeps the prepared PDF when the share chooser is cancelled', async () => {
  create.mockResolvedValue(new File(['PDF'], 'bill.pdf'))
  vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')) })
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Prepare bill PDF' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Share bill' }))
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled()
})
it('reports PDF errors without losing the bill', async () => {
  create.mockRejectedValue(new Error('Renderer unavailable'))
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Prepare bill PDF' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Retry')
  expect(screen.getByText('Bill')).toBeInTheDocument()
})
