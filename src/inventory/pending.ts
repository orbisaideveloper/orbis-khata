import { inventoryCommand } from './model'
export const inventoryPendingKey = (user:string)=>`khata-inventory-pending-v1:${user}`
export function restoreInventory(user:string) {
 try {
  const raw=sessionStorage.getItem(inventoryPendingKey(user))
  if(!raw||raw.length>32768)return null
  return inventoryCommand(JSON.parse(raw))
 } catch {return null}
}
