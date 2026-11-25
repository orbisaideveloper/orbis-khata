import { describe, expect, it } from 'vitest'
import { liveAuthenticatedExecutableFunctions, liveBackendFunctionCoverage,
  liveBackendTriggerCoverage, liveScheduledJobCoverage, gatewayDirectTableWrites } from '../../src/sync-v2/phase2a-coverage.ts'
import { assessPhase2bClosure, authenticatedRpcGates, schedulerGates,
  nonRpcGates } from '../../src/sync-v2/phase2b-closure-gates.ts'

describe('Phase 2B server release closure is fail-closed', () => {
  it('pins each live RPC and scheduler without treating a green fixture as global certification', () => {
    expect(Object.keys(authenticatedRpcGates).sort()).toEqual([...liveAuthenticatedExecutableFunctions].sort())
    expect(Object.keys(schedulerGates).sort()).toEqual(Object.keys(liveScheduledJobCoverage).sort())
    expect(Object.keys(liveBackendFunctionCoverage)).toHaveLength(26)
    expect(Object.keys(liveBackendTriggerCoverage)).toHaveLength(26)
    expect(Object.keys(nonRpcGates)).toContain('historical-snapshot')
    expect(Object.keys(nonRpcGates)).toContain('direct-edge-ingress')
  })
  it('cannot certify 2B on a single native 32-retry test, or on green GitHub Actions', () => {
    const one = assessPhase2bClosure(new Set(['rpc:public.khata_post_v1']))
    expect(one.complete).toBe(false)
    expect(one.pending).toContain('rpc:public.khata_workspace_v3')
    expect(one.pending).toContain('cron:khata-retired-company-purge')
    expect(one.pending).toContain('gate:historical-snapshot')
    expect(one.pending).toContain('trigger:public.khata_vouchers.inventory_voucher_reversal')
    expect(one.pending).toContain('edge:public.khata_companies')
    expect(one.pending).toContain('internal-rpc:orbis_khata.purge_retired_companies')
  })
  it('requires full individually attributable evidence rather than one blanket PASS', () => {
    const blank = assessPhase2bClosure(new Set())
    expect(blank.complete).toBe(false)
    expect(blank.pending).toHaveLength(26 + 26 + 4 + Object.keys(gatewayDirectTableWrites).length + Object.keys(nonRpcGates).length)
    const approved = new Set(blank.pending)
    expect(assessPhase2bClosure(approved)).toEqual({ complete: true, pending: [] })
    approved.delete('rpc:public.khata_post_v1')
    expect(assessPhase2bClosure(approved).complete).toBe(false)
  })
})
