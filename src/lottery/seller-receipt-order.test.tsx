import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DailySellerEntry, sellerRecoveryFallbackToken, resolveSellerRecoveryFallback } from '../../vendor/foundation-lottery/src/admin/dashboard/sections/DailySellerEntry'
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

it('retains the original fallback recovery copy and rejects marking a newer fallback as resolved',()=>{
 const key='orbis.khata.lottery.pending-seller-row.org.seller.2026-11-16';
 localStorage.setItem(key,'old pending copy');const token=sellerRecoveryFallbackToken('org','seller','2026-11-16');
 resolveSellerRecoveryFallback('org','seller','2026-11-16',token);expect(localStorage.getItem(key)).toBe('old pending copy');expect(localStorage.getItem(key+':resolved')).toBe(token);
 localStorage.setItem(key,'newer edit');expect(()=>resolveSellerRecoveryFallback('org','seller','2026-11-16',token)).toThrow('RECOVERY_LOCAL_CHANGED');expect(localStorage.getItem(key)).toBe('newer edit');
});
