export const drawSlots = ['1pm', '6pm', '8pm'] as const
export type DrawSlot = typeof drawSlots[number]
export function indiaDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
