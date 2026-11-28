import type { Sql, TransactionSql } from 'npm:postgres@3.4.7'
import { GatewayRejection } from '../../../src/accounting/gateway-admission.ts'
import type { Command, Entry } from '../../../src/daily-ledger/journal.ts'
import type { DailyLedgerDatabase } from '../../../src/daily-ledger/server-service.ts'
import { dailyWebMaxEntries, dailyWebPageSize, type Receipt } from '../../../src/daily-ledger/web-contract.ts'

type Row = { revision: string; digest: string; command: Command; postings: Entry['postings'] }

const receipt = (row: Row): Receipt => ({
  revision: row.revision, digest: row.digest, entry: { command: row.command, postings: row.postings },
})

function projection(tx: TransactionSql) {
  return tx`c.revision::text, c.command_digest AS digest, c.command_body AS command,
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', p.operation_id::text || ':' || p.slot, 'account', p.account, 'delta', p.amount_minor::text
    ) ORDER BY p.slot) FROM orbis_daily_ledger.postings p
    WHERE p.owner_id = c.owner_id AND p.operation_id = c.operation_id), '[]'::jsonb) AS postings`
}

async function head(tx: TransactionSql, owner: string) {
  const [row] = await tx<{ revision: string }[]>`
    SELECT coalesce(max(revision), 0)::text AS revision FROM orbis_daily_ledger.commands WHERE owner_id = ${owner}::uuid`
  return row.revision
}

async function append(tx: TransactionSql, owner: string, entry: Entry, digest: string): Promise<Receipt> {
  const previous = BigInt(await head(tx, owner))
  if (previous >= BigInt(dailyWebMaxEntries)) throw new GatewayRejection(409, 'DAILY_WEB_HISTORY_LIMIT')
  const revision = String(previous + 1n)
  const original = entry.command.kind === 'reversal' ? entry.command.originalId : null
  await tx`INSERT INTO orbis_daily_ledger.commands
    (owner_id, operation_id, revision, effective_date, command_digest, command_body, reverses_operation_id, posting_count)
    VALUES (${owner}::uuid, ${entry.command.id}::uuid, ${revision}::bigint, ${entry.command.date}::date,
      ${digest}, ${tx.json(entry.command)}::jsonb, ${original}::uuid, ${entry.postings.length})`
  if (entry.postings.length) {
    const rows = entry.postings.map((posting, slot) => ({
      owner_id: owner, operation_id: entry.command.id, slot, account: posting.account, amount_minor: posting.delta,
    }))
    await tx`INSERT INTO orbis_daily_ledger.postings ${tx(rows)}`
  }
  return { revision, digest, entry }
}

export function createDailyLedgerDatabase(connection: Sql): DailyLedgerDatabase {
  function withOwner<T>(owner: string, work: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return connection.begin(async tx => {
      await tx`SET LOCAL ROLE orbis_daily_ledger_gateway`
      await tx`SET LOCAL statement_timeout = '5s'`
      await tx`SELECT set_config('orbis.daily_ledger.owner', ${owner}, true)`
      return work(tx)
    }) as Promise<T>
  }

  return {
    write: (owner, work) => withOwner(owner, async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'orbis.daily-ledger:' + owner}, 0))`
      return work({
        find: async operationId => {
          const [row] = await tx<Row[]>`SELECT ${projection(tx)} FROM orbis_daily_ledger.commands AS c
            WHERE c.owner_id = ${owner}::uuid AND c.operation_id = ${operationId}::uuid`
          return row && receipt(row)
        },
        history: async () => {
          const rows = await tx<Row[]>`SELECT ${projection(tx)} FROM orbis_daily_ledger.commands AS c
            WHERE c.owner_id = ${owner}::uuid ORDER BY c.effective_date DESC, c.revision DESC
            LIMIT ${dailyWebMaxEntries + 1}`
          if (rows.length > dailyWebMaxEntries) throw new GatewayRejection(409, 'DAILY_WEB_HISTORY_LIMIT')
          return rows.map(row => receipt(row).entry)
        },
        append: (entry, digest) => append(tx, owner, entry, digest),
      })
    }),
    page: (owner, after, through) => withOwner(owner, async tx => {
      const latest = await head(tx, owner)
      if (through !== undefined && BigInt(through) > BigInt(latest)) {
        throw new GatewayRejection(400, 'DAILY_WEB_INPUT_INVALID')
      }
      const snapshot = through ?? latest
      const rows = await tx<Row[]>`SELECT ${projection(tx)} FROM orbis_daily_ledger.commands AS c
        WHERE c.owner_id = ${owner}::uuid AND c.revision > ${after}::bigint AND c.revision <= ${snapshot}::bigint
        ORDER BY c.revision LIMIT ${dailyWebPageSize + 1}`
      return {
        records: rows.slice(0, dailyWebPageSize).map(receipt), through: snapshot,
        nextCursor: rows.length > dailyWebPageSize ? rows[dailyWebPageSize - 1].revision : null,
      }
    }),
  }
}
