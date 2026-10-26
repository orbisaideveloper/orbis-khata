import { expenseCommand } from './expense-model'
export function expensePendingKey(user: string, company: string) { return `khata-expense-pending-v1:${user}:${company}` }
export function restoreExpense(user: string, company: string) {
  try {
    const raw = sessionStorage.getItem(expensePendingKey(user,company))
    const p = raw && raw.length <= 8192 ? expenseCommand(JSON.parse(raw)) : null
    return p?.company === company ? p : null
  } catch { return null }
}
