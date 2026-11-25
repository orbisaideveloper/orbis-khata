import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  gatewayOperationCoverage, workspaceActionCoverage, lotteryReadCoverage,
  lotteryWriteCoverage, expenseProfileActionCoverage, inventoryKindCoverage,
  customerRelayActionCoverage, lotteryPartySharingCoverage,
  familyContracts, policyDecisionRegister, liveBackendFunctionCoverage, liveBackendTriggerCoverage, liveAuthenticatedExecutableFunctions, liveScheduledJobCoverage, frozenPhase2AContract, gatewayDirectTableWrites,
} from '../../src/sync-v2/phase2a-coverage.ts'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const strings = (s: string) => [...s.matchAll(/'([^']+)'/gu)].map(m => m[1])
const keys = (data: Record<string, unknown>) => Object.keys(data).sort()
const verify = (actual: string[], registered: Record<string, unknown>) => {
  expect([...new Set(actual)].sort()).toEqual(keys(registered))
}

describe('Phase 2A exhaustive source-backed writer coverage', () => {
  it('covers every typed public gateway operation, including separate read-only transports', () => {
    const source = readSource('src/accounting/server-gateway.ts')
    const body = source.match(/type Operation = ([^;]+);/u)?.[1]
    expect(body).toBeDefined()
    verify(strings(body ?? ''), gatewayOperationCoverage)
    for (const [name, entry] of Object.entries(gatewayOperationCoverage)) {
      expect(familyContracts[entry.family], name).toBeDefined()
    }
  })

  it('covers every authenticated workspace action including reads, corrections and lifecycle', () => {
    const source = readSource('src/accounting/workspace-contract.ts')
    const body = source.match(/export function workspaceInput\([\s\S]*?switch \(p\.action\) \{([\s\S]*?)\n        default:/u)?.[1]
    expect(body).toBeDefined()
    verify([...((body ?? '').matchAll(/case '([^']+)':/gu))].map(m => m[1]), workspaceActionCoverage)
    expect(workspaceActionCoverage['number'].kind).toBe('write')
    expect(workspaceActionCoverage['number-preview'].kind).toBe('read')
    expect(workspaceActionCoverage['correct'].kind).toBe('write')
  })

  it('covers every Lottery read and write, including seller draft, PWD, commission and settlement paths', () => {
    const source = readSource('src/lottery/protocol.ts')
    const reads = source.match(/const reads=new Set\(\[([\s\S]*?)\]\)/u)?.[1]
    const writes = source.match(/const writes=new Set\(\[([\s\S]*?)\]\)/u)?.[1]
    expect(reads).toBeDefined()
    expect(writes).toBeDefined()
    verify(strings(reads ?? ''), lotteryReadCoverage)
    verify(strings(writes ?? ''), lotteryWriteCoverage)
    expect(keys(lotteryReadCoverage).filter(k => Object.hasOwn(lotteryWriteCoverage, k))).toEqual([])
    expect(lotteryWriteCoverage['recordPayment'].kind).toBe('write')
    expect(lotteryWriteCoverage['voidAccountingTransaction'].kind).toBe('write')
  })

  it('covers each expense profile mutation, inventory writer type and separate relay/share contract', () => {
    const profiles = readSource('src/expense-profiles/model.ts')
    const actions = profiles.match(/export type ProfileCommand=\{company:string;action:([^;]+);/u)?.[1]
    expect(actions).toBeDefined()
    verify(strings(actions ?? ''), expenseProfileActionCoverage)
    const inventory = readSource('src/inventory/model.ts')
    const kinds = inventory.match(/export type InventoryKind = ([^;]+);/u)?.[1]
    expect(kinds).toBeDefined()
    verify(strings(kinds ?? ''), inventoryKindCoverage)
    const relay = readSource('src/customer-view/relay/model.ts')
    const relaySwitch = relay.match(/export function relayCommand\([\s\S]*?switch \(x\.action\) \{([\s\S]*?)\n    default:/u)?.[1]
    expect(relaySwitch).toBeDefined()
    verify([...((relaySwitch ?? '').matchAll(/case '([^']+)':/gu))].map(m => m[1]), customerRelayActionCoverage)
    const sharing = readSource('src/customer-view/contract.ts')
    const fields = sharing.match(/const fields: Record<string, string\[\]> = \{([^}]+)\}/u)?.[1]
    expect(fields).toBeDefined()
    verify([...((fields ?? '').matchAll(/\b([a-z-]+):\s*\[/gu))].map(m => m[1]), lotteryPartySharingCoverage)
  })

  it('enumerates the direct SQL INSERT ingress bypassing typed RPC dispatch', () => {
    const source = readSource('supabase/functions/orbis-khata-data/index.ts')
    const inserts = [...source.matchAll(/insert into (public|orbis_khata)\.([a-z_]+)/giu)]
      .map(m => `${m[1]}.${m[2]}`)
    verify(inserts, gatewayDirectTableWrites)
    expect(gatewayDirectTableWrites['public.khata_companies'].kind).toBe('write')
    expect(gatewayDirectTableWrites['orbis_khata.drive_account_recovery'].family).toBe('external')
  })

  it('requires stable financial identity and known next-phase gates in every family', () => {
    expect(keys(familyContracts)).toEqual(['catalog','expense','external','inventory','invoice','ledger','lifecycle','lottery','master','settings'])
    for (const [name, entry] of Object.entries(familyContracts)) {
      expect(entry.scope.length, name).toBeGreaterThan(5)
      expect(entry.identity.length, name).toBeGreaterThan(7)
      expect(entry.children.length, name).toBeGreaterThan(10)
      expect(entry.invariant.length, name).toBeGreaterThan(20)
      expect(entry.nextGate, name).toMatch(/^2[BEF](\+2E)?$/u)
    }
    // Recipient/customer read-only relay is not an owner financial write capability.
    expect(familyContracts.external.scope).toBe('separate-readonly-relay')
    expect(gatewayOperationCoverage['customer-relay'].family).toBe('external')
    expect(gatewayOperationCoverage['drive-recovery'].kind).toBe('recovery')
  })

  it('pins the live metadata writer/trigger/RPC execute bypass inventory for explicit 2B review', () => {
    expect(Object.keys(liveBackendFunctionCoverage)).toHaveLength(26)
    expect(Object.keys(liveBackendTriggerCoverage)).toHaveLength(26)
    expect(liveAuthenticatedExecutableFunctions).toHaveLength(19)
    expect(new Set(liveAuthenticatedExecutableFunctions).size).toBe(19)
    for (const routine of liveAuthenticatedExecutableFunctions) {
      expect(Object.hasOwn(liveBackendFunctionCoverage, routine), routine).toBe(true)
    }
    for (const [path, entry] of Object.entries(liveBackendTriggerCoverage)) {
      expect(path.split('.')).toHaveLength(3)
      expect(familyContracts[entry.family]).toBeDefined()
    }
    expect(liveBackendTriggerCoverage['public.khata_vouchers.inventory_voucher_reversal'].kind).toBe('derived-write')
    expect(liveBackendTriggerCoverage['public.khata_vouchers.khata_production_purchase_reverse'].kind).toBe('derived-write')
    expect(liveBackendFunctionCoverage['orbis_khata.purge_retired_companies'].kind).toBe('write')
  })

  it('pins the allowed gateway database functions and refuses an untracked SQL RPC call', () => {
    const source = readSource('supabase/functions/orbis-khata-data/index.ts')
    const calls = [...source.matchAll(/public\.(khata_[a-z_0-9]+)\(/gu)]
      .map(m => `public.${m[1]}`)
    for (const rpc of calls.filter(name => !Object.hasOwn(gatewayDirectTableWrites, name))) {
      expect(Object.hasOwn(liveBackendFunctionCoverage, rpc), rpc).toBe(true)
    }
    expect(new Set(calls).size).toBeGreaterThan(10)
  })

  it('pins all known live scheduler ingress and the unchanged frozen v2 ADR/protocol', () => {
    expect(keys(liveScheduledJobCoverage)).toEqual([
      'khata-retired-company-purge', 'lottery-live-retention',
      'orbis-lottery-collector', 'orbis-statement-relay-cleanup',
    ])
    expect(liveScheduledJobCoverage['khata-retired-company-purge'].kind).toBe('write')
    expect(frozenPhase2AContract.protocolVersion).toBe(2)
    expect(frozenPhase2AContract.coreDecision).toBe('ADR-SYNC-002')
    expect(frozenPhase2AContract.entitlementDecision).toBe('ADR-ENTITLEMENT-001')
    expect(frozenPhase2AContract.scopeKinds).toEqual(['company','lottery-organization','account-catalog'])
    expect(frozenPhase2AContract.conflictPolicy).toContain('dependency-subgraph')
    expect(frozenPhase2AContract.customerView).toContain('read-only')
  })

  it('does not invent owner policy defaults or silently enable frozen live-sync decisions', () => {
    expect(keys(policyDecisionRegister)).toEqual(['P1','P2','P3','P4','P5','P6','P7'])
    for (const policy of Object.values(policyDecisionRegister)) {
      expect(policy.state).toBe('owner-required')
      expect(policy.question.length).toBeGreaterThan(20)
    }
  })
})
