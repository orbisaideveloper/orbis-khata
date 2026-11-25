/** Each write may depend on the preceding one, even on the same transaction. */
export function forEachInOrder<T>(values: readonly T[], apply: (value: T) => Promise<void>): Promise<void> {
  return values.reduce((pending, value) => pending.then(() => apply(value)), Promise.resolve())
}
