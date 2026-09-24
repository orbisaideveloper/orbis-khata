export type Company = { id: string; name: string }
type Party = Company & { kind: 'customer' | 'supplier' | 'both'; receivable: string; payable: string }
export type Kind = 'sale' | 'purchase' | 'receipt' | 'payment' | 'reversal'
export type Account = 'cash' | 'bank' | 'receivable' | 'payable' | 'sales' | 'purchases'
export type Voucher = {
  id: string; party_id: string; party_name: string; kind: Kind; effective_date: string
  amount_minor: string; debit_account: Account; credit_account: Account
  reference: string; note: string; reversed: boolean
}
export type Report = {
  balances: Partial<Record<Account, { closing: string; opening: string; movement: string }>>
  ledger_balances: Partial<Record<Account, { closing: string; opening: string }>>
  parties: Party[]; entries: Voucher[]; count: number; as_of: string
}
export type Command = {
  id: string; company: string; party: string; kind: Kind; date: string; amount: string
  method: 'cash' | 'bank'; reference: string; note: string; reverses: string | null
}
export function minor(input: string): string {
  const normalized = input.trim().replace(/[০-৯]/g, c => String((c.codePointAt(0) ?? 0) - 0x09e6))
    .replace(/[०-९]/g, c => String((c.codePointAt(0) ?? 0) - 0x0966))
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) throw new Error('INVALID_AMOUNT')
  const [whole, fraction = ''] = normalized.split('.')
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (value <= 0n || value > 999999999999n) throw new Error('INVALID_AMOUNT')
  return value.toString()
}
export function money(value: string | bigint): string {
  const n = BigInt(value), abs = n < 0n ? -n : n
  return `${n < 0n ? '−' : ''}₹${(abs / 100n).toLocaleString('en-IN')}.${String(abs % 100n).padStart(2, '0')}`
}
export function today(): string {
  // Fixed accounting zone, independent of the device's locale/time zone.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
export function balance(report: Report, account: Account, field: 'closing' | 'opening' | 'movement' = 'closing'): bigint {
  return BigInt(report.balances[account]?.[field] ?? '0')
}
