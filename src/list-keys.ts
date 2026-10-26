/** Repeated identical rows receive a stable occurrence within their own identity. */
export function keyedRows<T>(rows: readonly T[], identity: (row: T) => string) {
  const occurrences = new Map<string, number>()
  return rows.map(row => {
    const base = identity(row)
    const occurrence = (occurrences.get(base) ?? 0) + 1
    occurrences.set(base, occurrence)
    return { row, key: `${base}:${occurrence}` }
  })
}
