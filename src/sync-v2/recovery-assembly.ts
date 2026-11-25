import type { Json } from './command.ts'

export type RecoveryTransfer = Readonly<{
  version: number
  transfer: string
  purpose: 'snapshot' | 'group'
  scopeKind: string
  scopeId: string
  epoch: string
  from: string | null
  next: string
  items: number
  bytes: number
}>
export type RecoveryFragment = Readonly<{
  transfer: string
  item: number
  offset: number
  nextOffset: number
  size: number
  sha256: string
  hex: string
}>

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function cursor(value: string | null): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,18})$/u.test(value)) throw new Error('SYNC_RECOVERY_CURSOR')
  return BigInt(value)
}

async function readRecoveryItem(
  image: RecoveryTransfer, item: number, remaining: number,
  read: (item: number, offset: number) => Promise<RecoveryFragment>,
): Promise<{ row: Json; size: number }> {
  let offset = 0
  let digest = ''
  let data: Uint8Array<ArrayBuffer> | undefined
  async function* fragments() {
    do {
      yield read(item, offset)
    } while (data && offset < data.length)
  }
  for await (const part of fragments()) {
    if (part.transfer !== image.transfer || part.item !== item || part.offset !== offset ||
        !Number.isSafeInteger(part.size) || part.size < 1 || part.size > 2097152 ||
        !/^[0-9a-f]{64}$/u.test(part.sha256) || typeof part.hex !== 'string' ||
        part.hex.length > 49152 || !/^(?:[0-9a-f]{2})+$/u.test(part.hex) ||
        part.nextOffset !== offset + part.hex.length / 2 || part.nextOffset > part.size ||
        (data !== undefined && (data.length !== part.size || digest !== part.sha256)) ||
        part.size > remaining) throw new Error('SYNC_RECOVERY_FRAGMENT')
    data ??= new Uint8Array(part.size)
    digest = part.sha256
    for (let index = 0; index < part.hex.length; index += 2) {
      data[offset + index / 2] = Number.parseInt(part.hex.slice(index, index + 2), 16)
    }
    offset = part.nextOffset
  }
  if (!data || hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data))) !== digest) {
    throw new Error('SYNC_RECOVERY_DIGEST')
  }
  const row = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) as Json
  return { row, size: data.length }
}

/** Private staging contract. No caller projection or cursor is changed here. */
export async function assembleRecoveryTransfer(
  raw: RecoveryTransfer,
  expected: Pick<RecoveryTransfer, 'purpose' | 'scopeKind' | 'scopeId' | 'epoch' | 'from'>,
  read: (item: number, offset: number) => Promise<RecoveryFragment>,
): Promise<readonly Json[]> {
  const image = { ...raw }
  if (image.version !== 1 || !image.transfer || image.purpose !== expected.purpose || image.scopeKind !== expected.scopeKind ||
      image.scopeId !== expected.scopeId || image.epoch !== expected.epoch || image.from !== expected.from ||
      !Number.isSafeInteger(image.items) || image.items < 0 || image.items > 16000 ||
      !Number.isSafeInteger(image.bytes) || image.bytes < 0 || image.bytes > 16777216) {
    throw new Error('SYNC_RECOVERY_MANIFEST')
  }
  const through = cursor(image.next)
  const after = image.purpose === 'group' ? cursor(image.from) : null
  if (after !== null && (image.items === 0 || through !== after + BigInt(image.items))) {
    throw new Error('SYNC_RECOVERY_GROUP_BOUNDARY')
  }
  const staged: Json[] = []
  let total = 0
  async function* items() {
    for (let item = 1; item <= image.items; item++) {
      yield readRecoveryItem(image, item, image.bytes - total, read)
    }
  }
  for await (const { row, size } of items()) {
    const item = staged.length + 1
    if (after !== null && (typeof row !== 'object' || row === null || !('seq' in row) ||
        typeof row.seq !== 'string' || cursor(row.seq) !== after + BigInt(item))) {
      throw new Error('SYNC_RECOVERY_GROUP_BOUNDARY')
    }
    total += size
    staged.push(row)
  }
  if (total !== image.bytes) throw new Error('SYNC_RECOVERY_MANIFEST')
  return staged
}
