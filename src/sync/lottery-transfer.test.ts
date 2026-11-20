import { expect, it } from 'vitest'
import { runLottery } from '../lottery/service'
import { emptyDeviceLocalSnapshot } from '../demo/store'
import { lotteryStateKey, stageLotteryPull } from './lottery-transfer'

const actor = '01234567-89ab-7def-8123-456789abcdef'
const payload = (state: unknown) => ({ version: 1, actor, state })
async function firstState() {
  return (await runLottery({}, { method: 'createOrganization', payload: { name: 'Test' }, operationId: crypto.randomUUID() }, actor)).state
}

it('imports, advances, and repeats without changing Khata records or duplicating Lottery rows', async () => {
  const first = await firstState()
  const current = { ...emptyDeviceLocalSnapshot(), companies: [{ id: 'khata', name: 'Local' }] }
  const imported = await stageLotteryPull(current, actor, payload(first))
  const second = structuredClone(first)
  second.foundationAccountingOrganization[0].name = 'Updated on web'
  const updated = await stageLotteryPull(imported.snapshot, actor, payload(second))
  expect(updated.snapshot.companies).toEqual(current.companies)
  expect(updated.snapshot.workspaceEvents[lotteryStateKey].result).toEqual(second)
  expect((await stageLotteryPull(updated.snapshot, actor, payload(second))).changed).toBe(false)
})

it('preserves unsynced local changes and rejects a foreign actor or invalid record set', async () => {
  const first = await firstState()
  const imported = await stageLotteryPull(emptyDeviceLocalSnapshot(), actor, payload(first))
  const edited = structuredClone(imported.snapshot)
  edited.workspaceEvents[lotteryStateKey].result = { ...first, foundationLotteryPayment: [{ id: 'local' }] }
  await expect(stageLotteryPull(edited, actor, payload(first))).rejects.toThrow('LOTTERY_SYNC_LOCAL_CONFLICT')
  await expect(stageLotteryPull(edited, 'other', payload(first))).rejects.toThrow('LOTTERY_EXPORT_INVALID')
  await expect(stageLotteryPull(edited, actor, payload({ unknown: [] }))).rejects.toThrow('LOTTERY_EXPORT_INVALID')
})

it('transfers real sale, split receipt and ledger projections without changing their totals', async () => {
  let state = await firstState()
  const org = state.foundationAccountingOrganization[0].id
  const run = async (method: string, payload: Record<string, unknown>) => {
    const answer = await runLottery(state, { method, payload, operationId: crypto.randomUUID() }, actor)
    state = answer.state
    return answer.result as Record<string, any>
  }
  const party = await run('createParty', { organizationId: org, name: 'Synthetic seller', partyType: 'SELLER', ticketRatePaise: '1000' })
  const stockist = await run('createParty', { organizationId: org, name: 'Synthetic stockist', partyType: 'STOCKIST', ticketRatePaise: '1000' })
  await run('saveDailyStockistEntry', { organizationId: org, partyId: stockist.id, occurredAt: '2026-11-01', purchaseQuantity: '20', morningReturnQuantity: '0', dayReturnQuantity: '0', eveningReturnQuantity: '0', commissionPaise: '0' })
  await run('recordSale', { organizationId: org, partyId: party.id, occurredAt: '2026-11-01', dispatchQuantity: '10', morningReturnQuantity: '0', dayReturnQuantity: '0', eveningReturnQuantity: '0', commissionPaise: '0' })
  await run('recordPayment', { organizationId: org, partyId: party.id, occurredAt: '2026-11-01', direction: 'RECEIPT', totalAmountPaise: '6000', methodSplit: { cashPaise: '4000', bankPaise: '1000', pwtPaise: '1000' } })
  const before = await run('getWorkspace', { organizationId: org })
  const imported = await stageLotteryPull(emptyDeviceLocalSnapshot(), actor, payload(state))
  const local = imported.snapshot.workspaceEvents[lotteryStateKey].result
  const after = await runLottery(local, { method: 'getWorkspace', payload: { organizationId: org } }, actor)
  expect(after.result).toEqual(before)
  expect(before.payments).toHaveLength(1)
})

it('rejects duplicate IDs, broken relations and incompatible scalar data before staging', async () => {
  const state = await firstState()
  const original = state.foundationAccountingOrganization[0]
  for (const change of [
    { ...state, foundationAccountingOrganization: [original, original] },
    { ...state, foundationAccountingOrganization: [{ ...original, name: 12 }] },
    { ...state, foundationAccountingOrganization: [{ id: 'missing-fields' }] },
  ]) {
    await expect(stageLotteryPull(emptyDeviceLocalSnapshot(), actor, payload(change))).rejects.toThrow()
  }
})

it('establishes a baseline for identical legacy data while retaining local receipts', async () => {
  const first = await firstState()
  const current = emptyDeviceLocalSnapshot()
  current.workspaceEvents[lotteryStateKey] = { payload: '', result: first }
  current.workspaceEvents['android-lottery:receipt:old'] = { payload: 'local', result: { id: 'receipt' } }
  const matched = await stageLotteryPull(current, actor, payload(first))
  expect(matched.changed).toBe(false)
  expect(matched.snapshot.workspaceEvents['android-lottery:receipt:old']).toEqual(current.workspaceEvents['android-lottery:receipt:old'])
  expect(matched.snapshot.workspaceEvents['web-lottery-sync:baseline']).toBeDefined()
})
