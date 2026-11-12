import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  rows: new Map<string, Uint8Array>(),
  credential: vi.fn(),
  request: vi.fn(),
  masters: vi.fn(),
  restore: vi.fn(),
  journal: vi.fn(),
  registerScope: vi.fn(),
  state: { companies: [] as string[] },
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async isInConfigEncryption() { return { result: true } }
    async isSecretStored() { return { result: true } }
  },
}))
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    status: async () => ({ nativePlatform: 'android', hardwareBacked: true, secretPresent: true }),
  }),
}))
vi.mock('../local-db/android-sqlcipher-runtime', () => ({ createAndroidSqlcipherRuntime: () => ({}) }))
vi.mock('../local-db/native-cipher-gate', () => ({
  openVerifiedAndroidSqlcipher: async () => ({
    get: async (_sql: string, params: string[]) => {
      const bytes = fixture.rows.get(`${params[0]}:${params[3]}`)
      return bytes ? { sealed_hex: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') } : null
    },
    run: async (sql: string, params: [string, string, string, string, string, Uint8Array]) => {
      if (sql.includes('INSERT INTO local_outbox')) return fixture.journal()
      if (sql.includes('INSERT INTO local_snapshots')) fixture.rows.set(`${params[0]}:${params[3]}`, params[5])
      return { changes: 1 }
    },
    transaction: async (work: () => Promise<void>) => {
      const prior = new Map(fixture.rows)
      try {
        await work()
      } catch (error) {
        fixture.rows = prior
        throw error
      }
    },
  }),
}))
vi.mock('../local-db/sqlite-repository', () => ({
  ensureLocalSchema: async () => {},
  createLocalSqliteRepository: () => ({ registerScope: fixture.registerScope }),
}))
vi.mock('../offline-integration/android-hardware-codec', () => ({
  createAndroidHardwareRecordCodec: () => ({
    verifyDeviceCredential: fixture.credential,
    seal: async (text: string) => new TextEncoder().encode(text.padEnd(29)),
    unseal: async (bytes: Uint8Array) => new TextDecoder().decode(bytes).trimEnd(),
  }),
}))
vi.mock('../demo/store', () => ({
  demoRequest: fixture.request,
  demoMasters: fixture.masters,
  readDeviceLocalSnapshot: () => structuredClone(fixture.state),
  restoreDeviceLocalSnapshot: (state: typeof fixture.state) => {
    fixture.restore(state)
    fixture.state = structuredClone(state)
  },
  emptyDeviceLocalSnapshot: () => ({ companies: [] }),
}))

const actor = '01234567-89ab-7def-8123-456789abcdef'
const displayId = 'ORB-U-ABCDEFGH'
const hint = 'orbis.khata.android.local.actor.v1'

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  localStorage.clear()
  fixture.rows.clear()
  fixture.state = { companies: [] }
  fixture.credential.mockResolvedValue(true)
  fixture.journal.mockResolvedValue({ changes: 1 })
})

describe('Android local accounting runtime', () => {
  it('requires valid central identity and a device credential', async () => {
    const runtime = await import('./runtime')
    await expect(runtime.enrollVerifiedCentralIdentity('invalid', displayId))
      .rejects.toThrow('ANDROID_LOCAL_CENTRAL_IDENTITY_INVALID')
    expect(fixture.credential).not.toHaveBeenCalled()
    fixture.credential.mockResolvedValue(false)
    await expect(runtime.enrollVerifiedCentralIdentity(actor, displayId))
      .rejects.toThrow('ANDROID_DEVICE_CREDENTIAL_REQUIRED')
    expect(localStorage.getItem(hint)).toBeNull()
  })

  it('enrolls, persists a mutation, and restores it after a fresh module load', async () => {
    const runtime = await import('./runtime')
    expect(await runtime.restoreNativeOfflineIdentity()).toBeNull()
    await runtime.enrollVerifiedCentralIdentity(actor, displayId)
    expect(runtime.nativeLocalActor()).toBe(actor)
    expect(runtime.nativeLocalDisplayId()).toBe(displayId)

    fixture.request.mockImplementationOnce(async () => {
      fixture.state.companies.push('demo-company')
      return { saved: true }
    })
    await expect(runtime.nativeLocalRequest('create', { table: 'khata_companies', row: { id: 'demo-company' } }))
      .resolves.toEqual({ saved: true })
    expect(fixture.journal).toHaveBeenCalledOnce()

    vi.resetModules()
    fixture.state = { companies: [] }
    const restarted = await import('./runtime')
    await expect(restarted.restoreNativeOfflineIdentity()).resolves.toEqual({ actorId: actor, displayId })
    expect(fixture.state.companies).toEqual(['demo-company'])
    fixture.masters.mockReturnValue({ parties: [] })
    await expect(restarted.nativeLocalRequest('masters', { company: 'demo-company' }))
      .resolves.toEqual({ parties: [] })
    expect(fixture.journal).toHaveBeenCalledOnce()

    restarted.lockNativeOfflineIdentity()
    expect(restarted.nativeLocalDisplayId()).toBeNull()
    await expect(restarted.nativeLocalRequest('companies', {})).rejects.toThrow('ANDROID_LOCAL_UNLOCK_REQUIRED')
  })

  it('restores the durable snapshot after a journal write fails and permits a retry', async () => {
    const runtime = await import('./runtime')
    await runtime.enrollVerifiedCentralIdentity(actor, displayId)
    fixture.request.mockImplementation(async () => {
      fixture.state.companies.push('demo-company')
      return { saved: true }
    })
    fixture.journal.mockResolvedValueOnce({ changes: 0 })
    const input = { table: 'khata_companies', row: { id: 'demo-company' } }
    await expect(runtime.nativeLocalRequest('create', input))
      .rejects.toThrow('ANDROID_LOCAL_SAVE_UNCERTAIN_REVIEW_LEDGER')
    expect(fixture.state.companies).toEqual([])
    await expect(runtime.nativeLocalRequest('create', input)).resolves.toEqual({ saved: true })
    expect(fixture.state.companies).toEqual(['demo-company'])
  })

  it('fails closed when an enrolled snapshot loses a chunk', async () => {
    const runtime = await import('./runtime')
    await runtime.enrollVerifiedCentralIdentity(actor, displayId)
    fixture.rows.delete(`${actor}:state-part-0`)
    vi.resetModules()
    const restarted = await import('./runtime')
    await expect(restarted.restoreNativeOfflineIdentity()).rejects.toThrow('ANDROID_LOCAL_STATE_CHUNK_MISSING')
    expect(restarted.nativeLocalActor()).toBeNull()
  })
})
