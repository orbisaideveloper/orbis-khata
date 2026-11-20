import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DailySellerEntry } from '../../vendor/foundation-lottery/src/admin/dashboard/sections/DailySellerEntry'
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes'

afterEach(() => { cleanup(); localStorage.clear() })

it('records payment against an unchanged saved seller row without updating that draft again', async () => {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const party = { id: 'seller', name: 'Synthetic seller', partyType: 'SELLER', ticketRatePaise: '100' }
  const draft = { id: 'sale', partyId: party.id, occurredAt: day, status: 'DRAFT', syncVersion: 2, reference: 'TEST',
    dispatchQuantity: '10', morningReturnQuantity: '0', dayReturnQuantity: '0', eveningReturnQuantity: '0', commissionPaise: '0', partyPayablePaise: '1000' }
  const workspace = { organization: { id: 'org', tdsRateBps: 0, userLedgerStorage: 'CLOUD' }, parties: [party],
    draftSales: [draft], sales: [], payments: [], stockistEntries: [], periods: [] } as unknown as LotteryWorkspace
  const update = vi.fn().mockRejectedValue(new Error('SELLER_DRAFT_CONFLICT'))
  const pay = vi.fn().mockResolvedValue(undefined)
  render(<DailySellerEntry organizationId="org" workspace={workspace} localStore={null} localScope={{ ownerKind: 'PUBLIC_USER', ownerId: 'test-owner' }}
    onSaveDraft={vi.fn()} onUpdateDraft={update} onDeleteDraft={vi.fn()} onCorrectPosted={vi.fn()}
    onUpdateTdsRate={vi.fn()} onSavePayment={pay}/>)
  fireEvent.change(screen.getByLabelText('Receipt Cash'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }))
  await waitFor(() => expect(pay).toHaveBeenCalledOnce(), { timeout: 500 })
  expect(update).not.toHaveBeenCalled()
})
