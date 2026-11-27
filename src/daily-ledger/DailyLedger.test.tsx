import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readNativeDailyLedger, saveNativeDailyLedger } from '../native-local/runtime'
import { resolveKhataView } from '../navigation-policy'
import DailyLedger from './AndroidDailyLedger'
import { displayAmount } from './copy'
import { post } from './journal'

vi.mock('../native-local/runtime', () => ({
  readNativeDailyLedger: vi.fn(), saveNativeDailyLedger: vi.fn(),
}))
const owner = '11111111-1111-7111-8111-111111111111'
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('requires a signed-in owner and a locally enabled Android feature', () => {
  expect(resolveKhataView('daily', false, true, true, true)).toBe('workspace')
  expect(resolveKhataView('daily', true, false, false)).toBe('workspace')
  expect(resolveKhataView('daily', true, false, false, true)).toBe('daily')
})

it('saves a localized amount and retains the draft while changing languages', async () => {
  vi.mocked(readNativeDailyLedger).mockResolvedValue([])
  vi.mocked(saveNativeDailyLedger).mockImplementation(async (_owner, input) => post(input))
  const view = render(<DailyLedger owner={owner} language="bn"/>)
  fireEvent.click(await screen.findByRole('button', { name: 'টাকা পেলাম' }))
  expect(screen.getByRole('heading', { name: 'টাকা পেলাম' })).toHaveFocus()
  fireEvent.change(screen.getByLabelText('টাকার পরিমাণ'), { target: { value: '১২০.১৫' } })
  view.rerender(<DailyLedger owner={owner} language="hi"/>)
  expect(screen.getByLabelText('राशि')).toHaveValue('১২০.১৫')
  fireEvent.click(screen.getByRole('button', { name: 'सहेजें' }))
  expect(await screen.findByText('इस फ़ोन पर सहेजा गया')).toBeVisible()
  expect(saveNativeDailyLedger).toHaveBeenCalledWith(owner, expect.objectContaining({ amountMinor: '12015', kind: 'income' }))
  expect(displayAmount(12015n, 'en')).toBe('₹120.15')
})

it('locks the command on uncertain save and retries the same operation', async () => {
  vi.mocked(readNativeDailyLedger).mockResolvedValue([])
  vi.mocked(saveNativeDailyLedger).mockRejectedValueOnce(new Error('uncertain'))
    .mockImplementation(async (_owner, input) => post(input))
  render(<DailyLedger owner={owner} language="en"/>)
  fireEvent.click(await screen.findByRole('button', { name: 'Money paid' }))
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Save could not be confirmed')
  expect(screen.getByLabelText('Amount')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Saved on this phone')).toBeVisible()
  const calls = vi.mocked(saveNativeDailyLedger).mock.calls
  expect(calls).toHaveLength(2)
  expect(calls[0]).toEqual(calls[1])
})

it('discards a prior owner result when the signed-in view is replaced', async () => {
  const old = post({ version: 1, id: crypto.randomUUID(), kind: 'income', amountMinor: '100', wallet: 'cash',
    date: '2026-11-01', note: 'Previous owner note' })
  let finish: (entries: typeof old[]) => void = () => {}
  vi.mocked(readNativeDailyLedger).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce([])
  const view = render(<DailyLedger key="a" owner={owner} language="en"/>)
  view.rerender(<DailyLedger key="b" owner={crypto.randomUUID()} language="en"/>)
  await screen.findByText('No transactions found.')
  await act(async () => { finish([old]) })
  expect(screen.queryByText('Previous owner note')).not.toBeInTheDocument()
})

it('saves a budget without showing it as a transaction', async () => {
  vi.mocked(readNativeDailyLedger).mockResolvedValue([])
  vi.mocked(saveNativeDailyLedger).mockImplementation(async (_owner, input) => post(input))
  render(<DailyLedger owner={owner} language="en"/>)
  const summary = await screen.findByText('Monthly budget')
  const details = summary.closest('details')
  if (details) details.open = true
  fireEvent.click(screen.getByRole('button', { name: 'Set budget · Food' }))
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Saved on this phone')).toBeVisible()
  expect(saveNativeDailyLedger).toHaveBeenCalledWith(owner, expect.objectContaining({ kind: 'budget', category: 'food', amountMinor: '50000' }))
  expect(screen.getByText('No transactions found.')).toBeVisible()
})
