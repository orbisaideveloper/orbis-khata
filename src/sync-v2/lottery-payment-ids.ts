import type { PaymentCommand } from './lottery-payment-command.ts'

/** Generated identities are stable within each model across an aborted attempt. */
export async function createLotteryPaymentIds(command: PaymentCommand) {
  const models = [['foundationLotteryPayment', 1], ['foundationLotteryLedgerEntry', 16],
    ['foundationLotteryAuditEvent', 1], ['foundationLotteryDocumentSequence', 1]] as const
  const pool = new Map(await Promise.all(models.map(async ([model, count]) => [
    model,
    await Promise.all(Array.from({ length: count }, async (_, index) => {
      if (model === 'foundationLotteryPayment') return command.entityId
      const key = JSON.stringify(['orbis.lottery-payment.id.v1', command.actorId, command.scope.id, command.scope.epoch, command.operationId, model, index])
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)))
      hash[6] = (hash[6] & 15) | 128
      hash[8] = (hash[8] & 63) | 128
      const hex = Array.from(hash.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('')
      return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')
    })),
  ] as const)))
  return (model: string) => {
    const id = pool.get(model as typeof models[number][0])?.shift()
    if (!id) throw new Error('SYNC_LOTTERY_CHILD_UNSUPPORTED')
    return id
  }
}
