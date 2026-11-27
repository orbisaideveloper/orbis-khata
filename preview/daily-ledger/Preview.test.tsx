import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Preview from './Preview'

afterEach(cleanup)

it('labels all three preview languages and preserves a draft while changing the language', async () => {
  render(<Preview />)
  expect(screen.getByText('টেস্ট প্রিভিউ · নমুনা হিসাব')).toBeVisible()
  fireEvent.click(await screen.findByRole('button', { name: 'টাকা পেলাম' }))
  fireEvent.change(screen.getByLabelText('টাকার পরিমাণ'), { target: { value: '১২১.৫০' } })
  fireEvent.change(screen.getByLabelText('ভাষা'), { target: { value: 'hi' } })
  expect(screen.getByText('टेस्ट प्रीव्यू · नमूना डेटा')).toBeVisible()
  expect(screen.getByLabelText('राशि')).toHaveValue('১২১.৫০')
  fireEvent.change(screen.getByLabelText('भाषा'), { target: { value: 'en' } })
  expect(screen.getByText('TEST PREVIEW · SAMPLE DATA')).toBeVisible()
  expect(screen.getByLabelText('Amount')).toHaveValue('১২১.৫০')
  expect(document.documentElement.lang).toBe('en')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Sample entry added for this session')).toBeVisible()
  expect(screen.queryByText('Saved on this phone')).not.toBeInTheDocument()
})

it('updates the sample wallet without changing the total and keeps writes out of another mount', async () => {
  const view = render(<Preview />)
  fireEvent.change(screen.getByLabelText('ভাষা'), { target: { value: 'en' } })
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } })
  expect(screen.getByRole('main').parentElement).toHaveAttribute('data-preview-theme', 'dark')
  fireEvent.click(await screen.findByRole('button', { name: 'Transfer between my accounts' }))
  expect(screen.getByText('To account · Bank')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } })
  fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Sample transfer only' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Sample entry added for this session')).toBeVisible()
  expect(screen.getByText('₹2,050.00', { selector: '.daily-balance' })).toHaveClass('daily-balance')
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'Sample transfer only' } })
  expect(screen.getByText('Sample transfer only')).toBeVisible()
  const history = screen.getByRole('region', { name: 'Transaction history' })
  fireEvent.click(within(history).getByRole('button', { name: 'Reverse entry' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Sample entry added for this session')).toBeVisible()
  expect(screen.getByText('₹2,050.00', { selector: '.daily-balance' })).toHaveClass('daily-balance')
  view.unmount()
  render(<Preview />)
  await screen.findByRole('heading', { name: 'দৈনিক হিসাব' })
  expect(screen.queryByText('Sample transfer only')).not.toBeInTheDocument()
})

it('shows sample household debt and records a partial bill payment only in the mounted preview', async () => {
  const view = render(<Preview />)
  fireEvent.change(screen.getByLabelText('ভাষা'), { target: { value: 'hi' } })
  expect(await screen.findByText('लोग और उधार')).toBeVisible()
  expect(screen.getByText('घर के बिल')).toBeVisible()
  fireEvent.change(screen.getByLabelText('भाषा'), { target: { value: 'en' } })
  const debts = screen.getByText('People and loans').closest('details')!
  debts.open = true
  expect(screen.getByText('Receivable · ₹150.00 · Payable · ₹150.00')).toBeVisible()
  const bills = screen.getByText('Household bills').closest('details')!
  bills.open = true
  expect(screen.getByText('Unpaid · Outstanding · ₹850.00')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Pay bill' }))
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '851' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Advance and excess payments are unavailable.')
  expect(screen.getByLabelText('Amount')).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Sample entry added for this session')).toBeVisible()
  screen.getByText('Household bills').closest('details')!.open = true
  expect(screen.getByText('Partially paid · Outstanding · ₹800.00')).toBeVisible()
  expect(screen.getByText('₹2,000.00', { selector: '.daily-balance' })).toBeVisible()
  view.unmount()
  render(<Preview />)
  await screen.findByText('বাড়ির বিল')
  fireEvent.change(screen.getByLabelText('ভাষা'), { target: { value: 'en' } })
  screen.getByText('Household bills').closest('details')!.open = true
  expect(screen.getByText('Unpaid · Outstanding · ₹850.00')).toBeVisible()
})
