import { validateLotteryTransferState } from '../lottery/domain-store'
import metadata from '../../vendor/foundation-lottery/runtime/model-metadata'
import type { DeviceLocalSnapshot } from '../demo/store'

export const lotteryStateKey = 'android-lottery:state'
const baselineKey = 'web-lottery-sync:baseline'

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

// Preserve the original UTF-16 key order: locale-dependent ordering would
// invalidate already stored baseline digests on some devices.
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (object(value)) return '{' + Object.keys(value).sort((left, right) => Number(left > right) - Number(left < right)).map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}'
  return JSON.stringify(value) ?? 'null'
}

function lotteryStateText(value: unknown): string {
  if (!object(value)) throw new Error('LOTTERY_EXPORT_INVALID')
  const normalized: Record<string, unknown> = {}
  for (const [model, rows] of Object.entries(value)) {
    if (!Object.hasOwn(metadata, model) || !Array.isArray(rows)) throw new Error('LOTTERY_EXPORT_INVALID')
    const ids = new Set<string>()
    for (const row of rows) {
      if (!object(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error('LOTTERY_EXPORT_INVALID')
      ids.add(row.id)
    }
    if (rows.length) normalized[model] = [...rows].sort((a, b) => Number(a.id > b.id) - Number(a.id < b.id))
  }
  return stable(normalized)
}

export async function stageLotteryPull(current: DeviceLocalSnapshot, actor: string, payload: unknown) {
  if (!object(payload) || payload.version !== 1 || payload.actor !== actor || !object(payload.state)) {
    throw new Error('LOTTERY_EXPORT_INVALID')
  }
  validateLotteryTransferState(payload.state)
  const remote = lotteryStateText(payload.state)
  const local = lotteryStateText(current.workspaceEvents[lotteryStateKey]?.result ?? {})
  const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('')
  const localDigest = await hash(local)
  const baseline = current.workspaceEvents[baselineKey]?.result
  if (local !== remote && local !== '{}' && (!object(baseline) || baseline.digest !== localDigest)) {
    throw new Error('LOTTERY_SYNC_LOCAL_CONFLICT')
  }
  if (local === remote && object(baseline)) return { changed: false, snapshot: current }
  return {
    changed: local !== remote,
    snapshot: {
      ...current,
      workspaceEvents: {
        ...current.workspaceEvents,
        [lotteryStateKey]: { payload: '', result: structuredClone(payload.state) },
        [baselineKey]: { payload: '', result: { digest: await hash(remote), syncedAt: new Date().toISOString() } },
      },
    },
  }
}
