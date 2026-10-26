export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
