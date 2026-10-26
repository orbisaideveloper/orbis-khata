import type { BillTemplate } from '../demo/BillDesign'
const key = 'orbis.khata.bill-template.v1'
export function readBillTemplate(): BillTemplate {
  try {
    const value = localStorage.getItem(key)
    if (value === 'modern' || value === 'classic') return value
  } catch { /* Optional display preference; storage may be unavailable. */ }
  return 'sample'
}
export function rememberBillTemplate(value: BillTemplate) {
  try { localStorage.setItem(key, value) } catch { /* Current bill still uses the selected design. */ }
}
