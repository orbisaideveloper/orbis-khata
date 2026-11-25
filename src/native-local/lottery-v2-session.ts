import type { SqlitePort } from '../local-db/sqlite-repository.ts'
import type { NativeRecordCodec } from '../offline-integration/native-transactional-sync-store.ts'
import { createLocalFeed } from '../sync-v2/local-feed.ts'
import { createLocalFeedCodec, openSqliteLocalFeedStorage, withSqliteLocalFeedTransaction } from '../sync-v2/local-feed-storage.ts'
import { createLotteryPaymentOutbox } from '../sync-v2/lottery-payment-outbox.ts'
import { lotteryLocalRow } from '../sync-v2/lottery-local-projection.ts'
import { createLotteryPaymentIds } from '../sync-v2/lottery-payment-ids.ts'
import { parseLotteryPaymentCommand, type PaymentCommand } from '../sync-v2/lottery-payment-command.ts'
import type { LotteryInput } from '../lottery/protocol.ts'

export type NativeLotteryBinding = Readonly<{
  actor: string; client: 'android'; registration: string
  scope: Readonly<{ kind: 'lottery-organization'; id: string; epoch: string }>
  canWrite: boolean; expiresAt: string; credential: string
}>

const identifier = /^[A-Za-z0-9_-]{1,128}$/u
const digest = /^[a-f0-9]{64}$/u
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** Validity is a local precondition; the gateway remains the authority for revocation. */
export function verifyNativeLotteryBinding(binding: NativeLotteryBinding, actor: string, organization: string) {
  if (binding?.actor !== actor || binding.client !== 'android' || !binding.canWrite ||
      binding.scope?.kind !== 'lottery-organization' || binding.scope.id !== organization ||
      ![actor, organization, binding.registration, binding.scope.epoch].every(value => identifier.test(value)) ||
      !digest.test(binding.credential) || !Number.isFinite(Date.parse(binding.expiresAt)) ||
      Date.parse(binding.expiresAt) <= Date.now()) throw new Error('SYNC_LOTTERY_BINDING_UNVERIFIED')
  return binding
}

export function nativeLotteryBindingKey(actor: string, organization: string) {
  if (!identifier.test(actor) || !identifier.test(organization)) throw new Error('SYNC_LOTTERY_BINDING_UNVERIFIED')
  return ['sync-v2-native-payment', actor, organization, 'binding'].join(':')
}

export function nativeLotteryPaymentContext(db: SqlitePort, envelope: NativeRecordCodec, actor: string, binding: NativeLotteryBinding) {
  verifyNativeLotteryBinding(binding, actor, binding.scope.id)
  const codec = createLocalFeedCodec(envelope)
  const { scope, registration } = binding
  const project = (event: { change: import('../sync-v2/command.ts').Json }) => [lotteryLocalRow(scope.id, event.change)]
  const sessionFeed = (storage: import('../sync-v2/local-feed.ts').LocalFeedStorage) => createLocalFeed(actor, scope, storage, codec, project)
  const queue = (storage: import('../sync-v2/local-feed.ts').LocalFeedStorage) => createLotteryPaymentOutbox(actor, scope, registration, storage, codec, sessionFeed(storage))
  const counterId = ['sync-v2-native-payment', actor, scope.id, scope.epoch, registration, 'counter'].join(':')
  const counterContext = 'sync-v2-native-counter:' + counterId
  const allocateCommand = async (input: LotteryInput) => {
    if (input.method !== 'recordPayment' || !uuid.test(input.operationId ?? '')) throw new Error('SYNC_LOTTERY_PAYMENT_INVALID')
    const p = input.payload
    if (p.organizationId !== scope.id) throw new Error('SYNC_LOTTERY_BINDING_UNVERIFIED')
    const entityId = crypto.randomUUID()
    return { operationId: input.operationId!, entityId, p }
  }
  return {
    codec,
    feed: sessionFeed,
    queue,
    async status(operationId: string) {
      const storage = await openSqliteLocalFeedStorage(db)
      return queue(storage).status(operationId)
    },
    async savePayment(
      input: LotteryInput,
      calculate: (allocateId: (model: string) => string) => Promise<unknown>,
      persistWithinTransaction: () => Promise<void>,
    ) {
      const payment = await allocateCommand(input)
      let output: unknown
      await withSqliteLocalFeedTransaction(db, async storage => {
        const feed = sessionFeed(storage)
        const cursor = await feed.cursor()
        if (!cursor || cursor.epoch !== scope.epoch) throw new Error('SYNC_LOCAL_SNAPSHOT_REQUIRED')
        const pending = queue(storage)
        const previous = await pending.status(payment.operationId)
        if (previous !== 'missing') throw new Error('SYNC_LOTTERY_OPERATION_ALREADY_COMMITTED')
        const previousCounter = await storage.read(counterId)
        const raw = previousCounter === null ? '0' : await codec.open(previousCounter, counterContext)
        if (!/^(0|[1-9]\d{0,18})$/u.test(raw) || BigInt(raw) >= 999_999_999_999_999_999n) {
          throw new Error('SYNC_LOTTERY_CLIENT_SEQUENCE_INVALID')
        }
        const clientSequence = (BigInt(raw) + 1n).toString()
        const command = parseLotteryPaymentCommand({
          protocolVersion: 2, schemaVersion: 1, actorId: actor, deviceRegistrationId: registration,
          scope, commandType: 'lottery-payment', operationId: payment.operationId,
          entityId: payment.entityId, children: {}, dependsOn: [], baseRevision: null,
          clientSequence, createdAt: new Date().toISOString(), payload: payment.p,
        }, actor)
        const allocateId = await createLotteryPaymentIds(command)
        output = await calculate(allocateId)
        const result = output as { payment?: { id?: unknown } } | null
        if (result?.payment?.id !== command.entityId) throw new Error('SYNC_LOTTERY_PAYMENT_ID_MISMATCH')
        await persistWithinTransaction()
        const newCounter = await codec.seal(clientSequence, counterContext)
        await storage.commit(counterId, previousCounter, [{ id: counterId, sealed: newCounter }])
        await pending.enqueue(command as PaymentCommand)
      })
      return output
    },
  }
}
