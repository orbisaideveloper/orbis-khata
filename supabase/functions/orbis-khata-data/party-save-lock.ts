type Query = (statement: string, parameters: string[]) => PromiseLike<unknown>

/** Use the same order as khata_master_save_v2 before checking for duplicates. */
export async function lockPartySave(query: Query, company: string): Promise<void> {
  for (const namespace of ['stock-company:', 'expense-company:', 'master:']) {
    await query('select pg_advisory_xact_lock(hashtextextended($1 || $2::uuid::text,0))', [namespace, company])
  }
}
