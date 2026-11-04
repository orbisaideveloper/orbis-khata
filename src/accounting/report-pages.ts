export async function allPages<T extends { count: number; revision?:string }, K extends keyof T>(first: T, key: K, load: (offset: number) => Promise<T>): Promise<T> {
  const values = [...(first[key] as unknown as unknown[])]
  async function append(offset: number): Promise<void> {
    if (offset >= first.count) return
    const next = await load(offset)
    assertReportRevision(first,next);
    if(next.count!==first.count)throw new Error('REPORT_CHANGED_RETRY');
    values.push(...next[key] as unknown as unknown[])
    await append(offset + 50)
  }
  await append(50)
  return { ...first, [key]: values }
}

/** Never show totals assembled from different committed company revisions. */
export function assertReportRevision(...reports:{revision?:string}[]){
 const first=reports[0]?.revision;
 if(reports.every(report=>report.revision===undefined))return; // Older compatible fixtures/servers.
 if(typeof first!=='string'||!reports.every(report=>report.revision===first))throw new Error('REPORT_CHANGED_RETRY');
}
