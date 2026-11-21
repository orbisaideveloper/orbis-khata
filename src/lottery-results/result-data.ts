export const drawSlots = ['1pm', '6pm', '8pm'] as const
export type DrawSlot = typeof drawSlots[number]
export function indiaDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// Before the first draw today, select the upcoming 1 PM draw rather than yesterday.
export function currentDraw(now = new Date()): { date: string; slot: DrawSlot } {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(now))
  let slot: DrawSlot = '1pm'
  if (hour >= 18) slot = '6pm'
  if (hour >= 20) slot = '8pm'
  return { date: indiaDate(now), slot }
}
