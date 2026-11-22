import { indiaDate, type DrawSlot } from './result-data.ts'

/** Live selection is independent of a historical PDF/ticket selection. */
export function liveDraw(now: Date): { date: string; slot: DrawSlot } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const minutes = Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value)
  let slot: DrawSlot = '1pm'
  if (minutes >= 17 * 60 + 50) slot = '6pm'
  if (minutes >= 19 * 60 + 50) slot = '8pm'
  return { date: indiaDate(now), slot }
}
