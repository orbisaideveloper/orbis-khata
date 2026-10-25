import { inventoryCommand } from './model'
export const inventoryPendingKey = (user:string)=>`khata-inventory-pending-v1:${user}`
export function restoreInventory(user:string) {
 try {
  const raw=sessionStorage.getItem(inventoryPendingKey(user))
  if(!raw||raw.length>98304)return null
  const decoded=raw.startsWith('{')?raw:decodeURIComponent(raw)
  if(decoded.length>32768)return null
  return inventoryCommand(JSON.parse(decoded))
 } catch {return null}
}
