import { authClient } from '../auth/client'
import type { Command, Company, Report } from './model'

export function createKhataDataClient(options: { url: string; token: () => Promise<string | null>; fetchImpl?: typeof fetch }) {
  const endpoint = new URL(options.url)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('KHATA_DATA_ENDPOINT_INVALID')
  return async function request<T>(operation: string, input: unknown): Promise<T> {
    const token = await options.token()
    if (!token) throw new Error('AUTH_REQUIRED')
    const response = await (options.fetchImpl ?? fetch)(endpoint.href, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ version: 'orbis.khata.data.v1', operation, input }),
    })
    const text = await response.text()
    if (text.length > 2_000_000) throw new Error('KHATA_DATA_RESPONSE_INVALID')
    const value = JSON.parse(text) as { data: T; code?: string }
    if (!response.ok) {
      const error = new Error('KHATA_DATA_REQUEST_FAILED') as Error & { code?: string }
      error.code = typeof value.code === 'string' ? value.code : undefined
      throw error
    }
    return value.data
  }
}
async function request<T>(operation: string, input: unknown): Promise<T> {
  const url = import.meta.env.VITE_KHATA_DATA_URL as string | undefined
  const client = authClient
  if (!url || !client) throw new Error('KHATA_DATA_NOT_CONFIGURED')
  return createKhataDataClient({ url, token: () => client.central.accessToken() })<T>(operation, input)
}
export async function companies(_owner: string): Promise<Company[]> { return request<Company[]>('companies', {}) }
export async function createRecord(table: 'khata_companies' | 'khata_parties', row: Record<string, string>): Promise<Company> {
  // The backend derives ownership from the verified central session.
  const { owner_id: _owner, ...safe } = row
  return request<Company>('create', { table, row: safe })
}
export async function report(company: string, from: string, to: string, party: string, offset: number): Promise<Report> {
  return request<Report>('report', { company, from, to, party: party || null, offset })
}
export async function post(command: Command): Promise<void> { await request<unknown>('post', command) }
export function rejected(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? ''
  return /^(22|23|28|42|P0)/.test(code)
}

export async function expenseReport(company: string, from: string, to: string, offset: number): Promise<import('./expense-model').ExpenseReport> { return request('expense-report', {company,from,to,offset}) }
export async function postExpense(command: import('./expense-model').ExpenseCommand): Promise<void> { await request('expense-post', command) }
