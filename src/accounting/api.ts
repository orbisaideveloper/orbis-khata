import { authClient } from '../auth/client'
import type { Command, Company, Report } from './model'
function client() { if (!authClient) throw new Error('AUTH_REQUIRED'); return authClient }
export async function companies(owner: string): Promise<Company[]> {
  const result: Company[] = []
  for (let start = 0; ; start += 500) {
    const { data, error } = await client().from('khata_companies').select('id,name').eq('owner_id', owner).order('created_at').order('id').range(start, start + 499)
    if (error) throw error
    result.push(...(data ?? []))
    if (!data || data.length < 500) return result
  }
}
export async function createRecord(table: 'khata_companies' | 'khata_parties', row: Record<string, string>): Promise<Company> {
  const { data, error } = await client().from(table).insert(row).select('id,name').single()
  if (!error) return data as Company
  if (error.code !== '23505') throw error
  const retry = await client().from(table).select('*').eq('id', row.id).single()
  if (retry.error || !retry.data || Object.entries(row).some(([k, v]) => retry.data[k] !== v)) throw error
  return { id: retry.data.id, name: retry.data.name }
}
export async function report(company: string, from: string, to: string, party: string, offset: number): Promise<Report> {
  const { data, error } = await client().rpc('khata_report_v1', { p_company: company, p_from: from, p_to: to, p_party: party || null, p_offset: offset })
  if (error) throw error
  return data as Report
}
export async function post(command: Command): Promise<void> {
  const { error } = await client().rpc('khata_post_v1', {
    p_id: command.id, p_company: command.company, p_party: command.party, p_kind: command.kind,
    p_date: command.date, p_amount: command.amount, p_method: command.method,
    p_reference: command.reference, p_note: command.note, p_reverses: command.reverses,
  })
  if (error) throw error
}
export function rejected(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? ''
  // PostgreSQL transaction/constraint failures are definite rejections, unlike a lost HTTP response.
  return /^(22|23|28|42|P0)/.test(code)
}
