import { requestKhata } from '../accounting/api'
import type { InventoryCommand, InventoryReport } from './model'
export function inventoryReport(company: string, from: string, to: string, offset: number): Promise<InventoryReport> {
  return requestKhata('inventory-report',{company,from,to,offset})
}
export async function postInventory(command: InventoryCommand): Promise<void> { await requestKhata('inventory-post',command) }
