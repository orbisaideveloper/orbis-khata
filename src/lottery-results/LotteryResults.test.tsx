import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LotteryResults } from './LotteryResults'
import { currentDraw, indiaDate } from './result-data'
import { resolveKhataView } from '../navigation-policy'
import { readLocation, saveLocation } from '../workspace-location'

vi.mock('./useResultFeed', () => import('./result-feed.fixture'))

afterEach(cleanup)

describe('independent lottery result view', () => {
  it.each(['bn', 'hi', 'en'] as const)('shows an honest unavailable state in %s without financial writes', language => {
    const back = vi.fn()
    const { container } = render(<LotteryResults language={language} onBack={back}/>)
    expect(screen.getByRole('status')).toBeVisible()
    expect(screen.getByRole('status').tagName).toBe('OUTPUT')
    const date = container.querySelector('input')!
    fireEvent.change(date, { target: { value: '2026-11-14' } })
    expect(date.value).toBe('2026-11-14')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '8pm' } })
    expect(screen.getByRole('combobox')).toHaveValue('8pm')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to main home|মূল হোমে ফিরুন|मुख्य होम पर वापस जाएँ/ }))
    expect(back).toHaveBeenCalledOnce()
  })
  it('does not invent a result or enable payment entry', () => {
    render(<LotteryResults language="en" onBack={vi.fn()}/>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '6pm' } })
    expect(screen.getByText('Awaiting publication')).toBeVisible()
    expect(screen.getByRole('button', { name: /Sambad PDF/ })).toBeVisible()
    expect(screen.getByText('Dear Lottery Results')).toBeVisible()
    expect(screen.queryByRole('button', { name: /save receipt|save row|payment/i })).not.toBeInTheDocument()
  })
  it('uses the Indian date when UTC is still the previous day', () => {
    expect(indiaDate(new Date('2026-11-19T20:00:00Z'))).toBe('2026-11-20')
    expect(indiaDate(new Date('2026-11-19T18:29:59Z'))).toBe('2026-11-19')
  })
  it('guards the route and preserves location only for its owner', () => {
    expect(resolveKhataView('results', false, true, true)).toBe('welcome')
    expect(resolveKhataView('results', true, false, false)).toBe('results')
    saveLocation('results-owner', { view: 'results' })
    expect(readLocation('results-owner').view).toBe('results')
    expect(readLocation('different-owner').view).toBe('workspace')
  })
})

it.each([
  ['2026-11-20T18:31:00Z', '2026-11-21', '1pm'],
  ['2026-11-21T07:30:00Z', '2026-11-21', '1pm'],
  ['2026-11-21T12:29:59Z', '2026-11-21', '1pm'],
  ['2026-11-21T12:30:00Z', '2026-11-21', '6pm'],
  ['2026-11-21T14:30:00Z', '2026-11-21', '8pm'],
])('selects today and the current IST draw at %s', (time, date, slot) => {
  expect(currentDraw(new Date(time))).toEqual({ date, slot })
})
it('opens today despite older cached results and preserves manual selection', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-21T07:48:00Z'))
  const view = render(<LotteryResults language="en" onBack={vi.fn()}/>)
  expect(screen.getByLabelText('Draw date')).toHaveValue('2026-11-21')
  expect(screen.getByRole('combobox')).toHaveValue('1pm')
  fireEvent.change(screen.getByLabelText('Draw date'), { target: { value: '2026-11-20' } })
  view.rerender(<LotteryResults language="en" onBack={vi.fn()}/>)
  expect(screen.getByLabelText('Draw date')).toHaveValue('2026-11-20')
  vi.useRealTimers()
})

it.each(['bn', 'hi', 'en'] as const)('keeps ticket entry above documents and a highlighted warning before future ads in %s', language => {
  const { container } = render(<LotteryResults language={language} onBack={vi.fn()} onSelect={vi.fn()} languageControl={<select aria-label="Test language"><option>Language</option></select>}/>)
  const ticket = container.querySelector('.ticket-search')!
  const documents = container.querySelector('.result-sheet')!
  expect(ticket.compareDocumentPosition(documents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const warning = container.querySelector('.results-disclaimer')!
  expect(warning).toBeVisible()
  expect(warning.textContent).toMatch(/গ্যাজেট|गज़ट|gazette/)
  expect(warning.compareDocumentPosition(container.querySelector('.results-ad-slot')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByLabelText('Test language').closest('.results-header')).not.toBeNull()
  expect(screen.getByAltText('Dear Lotteries')).toHaveAttribute('src', expect.stringContaining('dear-lottery-logo.png'))
})

it('uses the approved headings and keeps unverified live video separate from historical PDFs', () => {
  render(<LotteryResults language="en" onBack={vi.fn()}/>)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ORBIS Khata')
  expect(screen.queryByText('Result documents')).not.toBeInTheDocument()
  const live = screen.getByRole('region', { name: 'Live draw' })
  const context = live.textContent
  fireEvent.change(screen.getByLabelText('Draw date'), { target: { value: '2026-11-01' } })
  expect(live.textContent).toBe(context)
  expect(screen.getByRole('button', { name: /Watch live draw/ })).toBeDisabled()
  expect(screen.getByText('Live video is not confirmed yet.')).toBeVisible()
})
