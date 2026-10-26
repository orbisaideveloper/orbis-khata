export async function allPages<T extends { count: number }, K extends keyof T>(first: T, key: K, load: (offset: number) => Promise<T>): Promise<T> {
  const values = [...(first[key] as unknown as unknown[])]
  async function append(offset: number): Promise<void> {
    if (offset >= first.count) return
    const next = await load(offset)
    values.push(...next[key] as unknown as unknown[])
    await append(offset + 50)
  }
  await append(50)
  return { ...first, [key]: values }
}
