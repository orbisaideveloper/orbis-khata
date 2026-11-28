export const isMonthlyAnchor = (day: unknown): day is number =>
  typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31

/** Civil Gregorian date only. The caller keeps the original anchor separately. */
export function recurringDueDate(month: string, anchor: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month) || !isMonthlyAnchor(anchor)) {
    throw new Error('DAILY_RECURRING_DATE_INVALID')
  }
  const year = Number(month.slice(0, 4))
  const number = Number(month.slice(5))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  let days = 31
  if (number === 2) days = leap ? 29 : 28
  else if ([4, 6, 9, 11].includes(number)) days = 30
  return month + '-' + String(Math.min(anchor, days)).padStart(2, '0')
}
