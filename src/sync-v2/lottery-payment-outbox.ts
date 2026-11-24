import { commandDigest, type Json, type Scope } from './command.ts'
import type { RecoveryFragment, RecoveryTransfer } from './recovery-assembly.ts'
import type { createLocalFeed, LocalFeedCodec, LocalFeedStorage, ScopedPage } from './local-feed.ts'
import { parseLotteryPaymentCommand, type PaymentCommand } from './lottery-payment-command.ts'

type Receipt = { digest: string; sequence: string; result: Json }
type Entry = { command: PaymentCommand; digest: string; receipt?: Receipt; reconciled: boolean }
type PayableScope = Scope<'lottery-organization'>
type Transport = {
  submit(command: PaymentCommand): Promise<unknown>
  feed(from: string): Promise<ScopedPage>
  recoverGroup?(from: string): Promise<{ manifest: RecoveryTransfer; read: (item: number, offset: number) => Promise<RecoveryFragment> }>
}

const identifier = /^[A-Za-z0-9_-]{1,128}$/u
const operationKey = /^[a-f0-9-]{36}$/u
const sequence = /^[1-9]\d{0,18}$/u

function checkedReceipt(value: unknown, entry: Entry): Receipt {
  const candidate = value as Partial<Receipt> | null
  const result = candidate?.result as { payment?: { id?: unknown } } | null | undefined
  if (!candidate || candidate.digest !== entry.digest || typeof candidate.sequence !== 'string' ||
      !sequence.test(candidate.sequence) || result?.payment?.id !== entry.command.entityId) {
    throw new Error('SYNC_OUTBOX_RECEIPT_INVALID')
  }
  return { digest: candidate.digest, sequence: candidate.sequence, result: candidate.result as Json }
}

/**
 * The authenticated session/device supplies actor, scope and transport.
 * Only the command and receipts persist here. The transport's credential never does.
 */
export function createLotteryPaymentOutbox(
  actor: string, scope: PayableScope, registration: string,
  storage: LocalFeedStorage, codec: LocalFeedCodec,
  projection: Pick<ReturnType<typeof createLocalFeed>, 'cursor' | 'apply' | 'appliedOperation'> & Partial<Pick<ReturnType<typeof createLocalFeed>, 'recoverGroup'>>,
) {
  if (scope.kind !== 'lottery-organization' || ![actor, scope.id, scope.epoch, registration].every(id => identifier.test(id))) {
    throw new Error('SYNC_OUTBOX_SCOPE_INVALID')
  }
  const { id: organization, epoch } = scope
  const partition = ['sync-v2-payment', actor, organization, epoch, registration].join(':')
  const indexId = partition + ':pending'
  const commandId = (id: string) => {
    if (!operationKey.test(id)) throw new Error('SYNC_OUTBOX_OPERATION_INVALID')
    return partition + ':' + id
  }

  async function context(id: string) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
    return 'sync-v2-payment:' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  async function read<T>(id: string, sealed: string | null): Promise<T | null> {
    return sealed === null ? null : JSON.parse(await codec.open(sealed, await context(id))) as T
  }
  async function seal(id: string, value: unknown) {
    return { id, sealed: await codec.seal(JSON.stringify(value), await context(id)) }
  }
  async function readIndex() {
    const marker = await storage.read(indexId)
    const pending = await read<string[]>(indexId, marker) ?? []
    return { marker, pending }
  }
  async function lookup(id: string, storedId = commandId(id)) {
    return read<Entry>(storedId, await storage.read(storedId))
  }

  async function update(
    operation: string,
    change: (entry: Entry | null) => Entry,
  ): Promise<Entry> {
    const id = commandId(operation)
    for (let attempt = 0; attempt < 4; attempt++) {
      const { marker, pending } = await readIndex()
      const before = await lookup(operation, id)
      const next = change(before)
      if (next === before) return next
      const updated = pending.filter(key => key !== operation)
      if (!next.reconciled) updated.push(operation)
      if (updated.length > 256) throw new Error('SYNC_OUTBOX_CAPACITY')
      const writes = await Promise.all([seal(id, next), seal(indexId, updated)])
      try {
        await storage.commit(indexId, marker, writes)
        return next
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'SYNC_LOCAL_STORAGE_CURSOR_CHANGED' || attempt === 3) throw error
      }
    }
    throw new Error('SYNC_OUTBOX_CONCURRENT_UPDATE')
  }

  return {
    async enqueue(raw: PaymentCommand) {
      const command = parseLotteryPaymentCommand(structuredClone(raw), actor)
      if (command.deviceRegistrationId !== registration || command.scope.epoch !== epoch ||
          command.scope.id !== organization) throw new Error('SYNC_OUTBOX_SCOPE_INVALID')
      const digest = await commandDigest(command)
      if (new TextEncoder().encode(JSON.stringify(command)).byteLength > 12_000) throw new Error('SYNC_OUTBOX_COMMAND_SIZE')
      await update(command.operationId, before => {
        if (before && before.digest !== digest) throw new Error('SYNC_OPERATION_DIGEST_MISMATCH')
        return before ?? { command, digest, reconciled: false }
      })
    },
    async pending() {
      return (await readIndex()).pending
    },
    async status(operation: string) {
      const entry = await lookup(operation)
      if (!entry) return 'missing'
      if (entry.reconciled) return 'reconciled'
      return entry.receipt ? 'posted-awaiting-ledger' : 'pending'
    },
    async resume(operation: string, transport: Transport) {
      let entry = await lookup(operation)
      if (!entry) throw new Error('SYNC_OUTBOX_OPERATION_MISSING')
      const initial = await projection.cursor()
      if (!initial || initial.epoch !== epoch) throw new Error('SYNC_LOCAL_SNAPSHOT_REQUIRED')
      if (!entry.receipt) {
        const receipt = checkedReceipt(await transport.submit(entry.command), entry)
        entry = await update(operation, before => {
          if (!before || before.digest !== receipt.digest) throw new Error('SYNC_OUTBOX_RECEIPT_INVALID')
          if (before.receipt) {
            if (before.receipt.sequence !== receipt.sequence) throw new Error('SYNC_OUTBOX_RECEIPT_INVALID')
            return before
          }
          return { ...before, receipt }
        })
      }
      const receipt = entry.receipt
      if (!receipt) throw new Error('SYNC_OUTBOX_RECEIPT_INVALID')
      if (entry.reconciled) return { state: 'reconciled' as const, receipt }
      let cursor = initial.sequence
      for (let pages = 0; pages < 8 && BigInt(cursor) < BigInt(receipt.sequence); pages++) {
        let page: ScopedPage
        try {
          page = await transport.feed(cursor)
        } catch (error) {
          const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
          if ((code !== 'SYNC_FEED_GROUP_TOO_LARGE' && code !== 'SYNC_FEED_PAGE_TOO_LARGE') ||
              !transport.recoverGroup || !projection.recoverGroup) throw error
          const recovered = await transport.recoverGroup(cursor)
          await projection.recoverGroup(recovered.manifest, recovered.read)
          const committed = await projection.cursor()
          if (!committed || committed.epoch !== epoch || BigInt(committed.sequence) <= BigInt(cursor)) {
            throw new Error('SYNC_OUTBOX_FEED_NOT_READY')
          }
          cursor = committed.sequence
          continue
        }
        if (page.from !== cursor || page.next === cursor) throw new Error('SYNC_OUTBOX_FEED_NOT_READY')
        await projection.apply(page)
        cursor = page.next
      }
      // Never infer success from a larger cursor alone. A snapshot can omit
      // inbox evidence, and a missing operation must remain visible for review.
      if (await projection.appliedOperation(receipt.sequence) !== operation) {
        return { state: 'posted-awaiting-ledger' as const, receipt }
      }
      await update(operation, before => {
        if (!before || before.receipt?.sequence !== receipt.sequence) throw new Error('SYNC_OUTBOX_RECEIPT_INVALID')
        return before.reconciled ? before : { ...before, reconciled: true }
      })
      return { state: 'reconciled' as const, receipt }
    },
  }
}

/** Create a scoped transport over the app's authenticated request client. */
export function createLotteryPaymentTransport(
  request: <T>(operation: string, input: unknown) => Promise<T>,
  binding: { scope: PayableScope; registration: string; credential: string },
): Transport {
  const { credential, registration, scope } = binding
  const { id: organization, epoch } = scope
  return {
    submit: command => request('lottery-sync', { action: 'payment', credential, command }),
    feed: cursor => request<ScopedPage>('lottery-sync', { action: 'feed', credential, organization,
      epoch, registration, cursor, limit: 250 }),
    async recoverGroup(cursor) {
      const input = { action: 'recover-group', credential, organization, epoch, registration, cursor }
      return {
        manifest: await request<RecoveryTransfer>('lottery-sync', input),
        read: (item, offset) => request<RecoveryFragment>('lottery-sync', { ...input, item, offset }),
      }
    },
  }
}
