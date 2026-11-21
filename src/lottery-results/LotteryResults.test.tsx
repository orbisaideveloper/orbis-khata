import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LotteryResults } from './LotteryResults'
import { indiaDate } from './result-data'
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
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://nagalandlotteries.com/results.php')
    fireEvent.click(screen.getByRole('button', { name: /Back to main home|মূল হোমে ফিরুন|मुख्य होम पर वापस जाएँ/ }))
    expect(back).toHaveBeenCalledOnce()
  })
  it('does not invent a result or enable payment entry', () => {
    render(<LotteryResults language="en" onBack={vi.fn()}/>)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '6pm' } })
    expect(screen.getByText('Verified result not available yet')).toBeVisible()
    expect(screen.getByText(/A reviewed result for this draw has not been downloaded/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /save|payment|scan|check/i })).not.toBeInTheDocument()
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
