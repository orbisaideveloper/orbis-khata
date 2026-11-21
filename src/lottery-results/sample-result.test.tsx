import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import sample from './sample-2026-11-20.json'
import { parseFeed } from './result-feed'
const sampleResult = (date: string, slot: string) => parseFeed({ schema: 1, results: [sample] }, '2026-11-20').find(row => row.date === date && row.slot === slot) ?? null
import { LotteryResults } from './LotteryResults'
import { ResultSheet } from './ResultSheet'

vi.mock('./useResultFeed', () => import('./result-feed.fixture'))

afterEach(cleanup)

it('retains all compared numbers as sorted unique strings including leading zeros', () => {
  const result = sampleResult('2026-11-20', '1pm')!
  expect(result.first).toEqual({ series: '35B', number: '45879' })
  expect(result.consolation).toBe('45879')
  expect(result.tiers.map(tier => tier.numbers.length)).toEqual([10, 10, 10, 100])
  for (const tier of result.tiers) {
    expect(tier.numbers).toEqual([...tier.numbers].sort((left, right) => left.localeCompare(right)))
    expect(new Set(tier.numbers).size).toBe(tier.numbers.length)
    expect(tier.numbers.every(number => new RegExp(tier.rank === 2 ? '^\\d{5}$' : '^\\d{4}$').test(number))).toBe(true)
  }
  expect(result.tiers[3].numbers).toContain('0022')
  expect(result.tiers[2].numbers).toContain('0597')
  expect(result.officialSha256).toMatch(/^[a-f0-9]{64}$/)
})

it('does not substitute the sample for a different draw', () => {
  expect(sampleResult('2026-11-19', '1pm')).toBeNull()
  expect(sampleResult('2026-11-20', '6pm')).toBeNull()
  expect(sampleResult('2026-11-20', '8pm')).toBeNull()
})

it.each(['bn', 'hi', 'en'] as const)('shows compact exact-draw PDF links without the old number grid in %s', language => {
  render(<LotteryResults language={language} onBack={vi.fn()}/>)
  expect(screen.getByRole('combobox')).toHaveValue('8pm')
  expect(screen.getByRole('status').tagName).toBe('OUTPUT')
  expect(screen.getByRole('link', { name: /মূল সরকারি|मूल आधिकारिक|Original official/ })).toHaveAttribute('href', 'https://nagalandlotteries.com/old_results/EN201126.PDF')
  expect(screen.queryByText('35B 45879')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /নমুনা দেখুন|नमूना देखें|View sample/ })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '1pm' } })
  expect(screen.getByRole('link')).toHaveAttribute('href', sample.officialUrl)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '6pm' } })
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('opens the exact API PDF directly without the provider website or number list', () => {
  const url = 'https://sambad.com/api-files/lottery-sambad-8pm-20-11-2026-fixture.pdf'
  render(<ResultSheet document={{ date: '2026-11-20', slot: '8pm', sambadUrl: url }} date="2026-11-20" slot="8pm" language="en"/>)
  expect(screen.getByRole('link', { name: /Lottery Sambad PDF/ })).toHaveAttribute('href', url)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('submits only the selected draw date to the official Sikkim six PM PDF archive', () => {
  const { container } = render(<ResultSheet document={{ date: '2026-11-20', slot: '6pm', officialSource: 'sikkim-6pm' }} date="2026-11-20" slot="6pm" language="en"/>)
  const form = container.querySelector('form')!
  expect(form).toHaveAttribute('method', 'post')
  expect(form).toHaveAttribute('action', 'https://www.sikkimlotteries.com/old_result.php')
  expect(new FormData(form).get('deardbpdf')).toBe('20/11/2026')
  expect(new FormData(form).get('deardb_pdf_btn')).toBe('Download')
  expect(screen.getByRole('button', { name: /Original official gazette/ })).toBeVisible()
})
