import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DailyLedger from './DailyLedger'
import { today } from '../accounting/model'
import { post, type Command } from './journal'
import { centralDailyLedgerGrant } from './central-grant'
import { dailyWebInput, validRevision, type Receipt } from './web-contract'
import { webLedgerStore } from './web-store'

const owner = '018d0000-0000-7000-8000-000000000101'
const grant = { version: 'orbis.daily-ledger.web.v1', ownerId: owner, active: true,
  certified: true, tier: 'Plus', capability: 'webLedger' }

describe('Daily Ledger Web contract', () => {
  it('rejects unissued, mismatched and uncertified grants', () => {
    for (const input of [null, {}, { ...grant, ownerId: 'another' }, { ...grant, tier: 'Free' },
      { ...grant, active: false }, { ...grant, certified: false }, { ...grant, capability: 'cloudLedger' }]) {
      expect(centralDailyLedgerGrant(input, owner)).toBeUndefined()
    }
    expect(centralDailyLedgerGrant(grant, owner)?.scope.scopeId).toBe(owner)
    expect(centralDailyLedgerGrant({ ...grant, tier: 'Premium' }, owner)?.tier).toBe('Premium')
  })

  it('validates revisions and disallows a later page without a snapshot', () => {
    expect(validRevision('9223372036854775807')).toBe(true)
    for (const revision of [undefined, 2, '01', '-1', '9223372036854775808']) {
      expect(validRevision(revision)).toBe(false)
    }
    expect(dailyWebInput({ action: 'list', after: '0' })).toBe(true)
    expect(dailyWebInput({ action: 'list', after: '1' })).toBe(false)
    expect(dailyWebInput({ action: 'list', after: '3', through: '2' })).toBe(false)
    expect(dailyWebInput({ action: 'save', command: [] })).toBe(false)
    expect(dailyWebInput({ action: 'save', command: {}, owner })).toBe(false)
    expect(dailyWebInput({ action: 'delete' })).toBe(false)
  })

  it('reports a save only after the server responds and reloads the stored entry', async () => {
    const rows: Receipt[] = []
    const request = async <T,>(input: unknown): Promise<T> => {
      const { action, command } = input as { action: string; command?: Command }
      if (action === 'list') {
        return { records: rows, nextCursor: null, through: String(rows.length) } as T
      }
      if (!command) throw Error('expected command')
      const entry = post(command)
      const response = { revision: String(rows.length + 1), digest: 'a'.repeat(64), entry }
      rows.push(response)
      return response as T
    }
    const view = render(<DailyLedger store={webLedgerStore(request)} language="en" web />)
    fireEvent.click(await screen.findByRole('button', { name: 'Money received' }))
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('Saved to the server')).toBeInTheDocument())
    expect(rows[0].entry.postings[0].delta).toBe('2000')
    view.unmount()
    render(<DailyLedger store={webLedgerStore(request)} language="en" web />)
    await screen.findByRole('heading', { name: 'Daily Ledger' })
    expect(rows).toHaveLength(1)
    expect(screen.getAllByText(/₹20\.00/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Saved on this phone')).toBeNull()
  })

  it('rejects a wrong receipt, a broken cursor and a missing revision', async () => {
    const command: Command = { version: 1, id: owner, date: today(), kind: 'income',
      wallet: 'cash', amountMinor: '900', note: '' }
    const request = vi.fn().mockResolvedValueOnce({ revision: '0', entry: post(command) })
      .mockResolvedValueOnce({ through: '1', nextCursor: '0', records: [] })
      .mockResolvedValueOnce({ through: '2', nextCursor: null, records: [{ revision: '2', entry: post(command) }] })
      .mockResolvedValueOnce({ through: '1', nextCursor: '1', records: [{ revision: '1', entry: post(command) }] })
      .mockResolvedValueOnce({ through: 'x', nextCursor: null, records: [] })
    const store = webLedgerStore(request)
    await expect(store.save(command)).rejects.toThrow('DAILY_WEB_RESPONSE_INVALID')
    for (let i = 0; i < 4; i++) await expect(store.list()).rejects.toThrow('DAILY_WEB_RESPONSE_INVALID')
  })
})
