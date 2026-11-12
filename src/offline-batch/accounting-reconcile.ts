/**
 * Step 06: synthetic accounting invariants, minor currency units (paise).
 * This is a pure, isolated calculation model, NOT a real financial post path.
 * A correction is represented as an immutable reversal + replacement, never
 * by overwriting a previously acknowledged voucher.
 */
type AccountingKind = 'sale' | 'customer-payment' | 'purchase' | 'supplier-payment' |
  'customer-advance' | 'advance-apply' | 'reversal'
export type SyntheticPosting = Readonly<{
  id: string
  companyId: string
  kind: AccountingKind
  amountPaise: number
  reversesId?: string
}>
export type SyntheticBalances = Readonly<{
  receivablePaise: number
  payablePaise: number
  cashPaise: number
  customerAdvancePaise: number
}>
const zero = (): SyntheticBalances => ({ receivablePaise: 0, payablePaise: 0, cashPaise: 0, customerAdvancePaise: 0 })
const valid = (x: number): boolean => Number.isSafeInteger(x) && x >= 0
const name = (x: string): boolean => /^[\w-]{1,128}$/u.test(x)
const delta = (kind: Exclude<AccountingKind, 'reversal'>, amount: number): SyntheticBalances => {
  if (kind === 'sale') return { receivablePaise: amount, payablePaise: 0, cashPaise: 0, customerAdvancePaise: 0 }
  if (kind === 'customer-payment') return { receivablePaise: -amount, payablePaise: 0, cashPaise: amount, customerAdvancePaise: 0 }
  if (kind === 'purchase') return { receivablePaise: 0, payablePaise: amount, cashPaise: 0, customerAdvancePaise: 0 }
  if (kind === 'supplier-payment') return { receivablePaise: 0, payablePaise: -amount, cashPaise: -amount, customerAdvancePaise: 0 }
  if (kind === 'customer-advance') return { receivablePaise: 0, payablePaise: 0, cashPaise: amount, customerAdvancePaise: amount }
  return { receivablePaise: -amount, payablePaise: 0, cashPaise: 0, customerAdvancePaise: -amount }
}
const add = (a: SyntheticBalances, b: SyntheticBalances, multiplier = 1): SyntheticBalances => {
  const next = {
    receivablePaise: a.receivablePaise + b.receivablePaise * multiplier,
    payablePaise: a.payablePaise + b.payablePaise * multiplier,
    cashPaise: a.cashPaise + b.cashPaise * multiplier,
    customerAdvancePaise: a.customerAdvancePaise + b.customerAdvancePaise * multiplier,
  }
  if (Object.values(next).some(n => !Number.isSafeInteger(n))) throw Error('ACCOUNTING_AMOUNT_OVERFLOW')
  return next
}
export function reconcileSyntheticPostings(companyId: string, postings: readonly SyntheticPosting[]): SyntheticBalances {
  if (!name(companyId)) throw Error('ACCOUNTING_COMPANY_INVALID')
  const seen = new Map<string, { original: SyntheticPosting; effect: SyntheticBalances }>()
  const reversed = new Set<string>()
  let balances = zero()
  for (const item of postings) {
    if (!name(item.id) || item.companyId !== companyId || seen.has(item.id) ||
        !valid(item.amountPaise) || item.amountPaise === 0) throw Error('ACCOUNTING_INVALID_OR_DUPLICATE')
    let effect: SyntheticBalances
    if (item.kind === 'reversal') {
      const prior = item.reversesId && seen.get(item.reversesId)
      if (!prior || prior.original.kind === 'reversal' || reversed.has(prior.original.id) ||
          item.amountPaise !== prior.original.amountPaise) throw Error('ACCOUNTING_REVERSAL_INVALID')
      reversed.add(prior.original.id)
      effect = add(zero(), prior.effect, -1)
    } else {
      if (item.reversesId !== undefined || !['sale','customer-payment','purchase','supplier-payment','customer-advance','advance-apply'].includes(item.kind)) {
        throw Error('ACCOUNTING_KIND_INVALID')
      }
      effect = delta(item.kind, item.amountPaise)
    }
    const next = add(balances, effect)
    if (next.receivablePaise < 0 || next.payablePaise < 0 || next.customerAdvancePaise < 0) {
      throw Error('ACCOUNTING_BALANCE_UNDERFLOW')
    }
    seen.set(item.id, { original: item, effect })
    balances = next
  }
  return balances
}
