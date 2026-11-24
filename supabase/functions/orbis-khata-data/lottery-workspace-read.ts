import type postgres from 'npm:postgres@3.4.7';
import {
  historyFragmentSize, historyModels, historyPage, historyPageRows, type HistoryRequest,
} from '../../../src/lottery/workspace-history.ts';

/** Share the writer's owner lock so the existing recurring-expense commit remains atomic. */
export async function loadCompactLottery(tx: postgres.TransactionSql, owner: string, organization: unknown) {
  if (typeof organization !== 'string' || !organization || organization.length > 128) {
    return { version: null, state: {} };
  }
  await tx`select pg_advisory_xact_lock(hashtextextended('lottery-owner:' || ${owner}::text,0))`;
  const [saved] = await tx`select version from public.khata_lottery_state where owner_id=${owner}::uuid`;
  if (!saved) return { version: null, state: {} };
  const records = await tx`
    with operational as materialized (
      select model,value,ordinal from public.khata_lottery_records
      where owner_id=${owner}::uuid
        and model not in (${historyModels.audit},${historyModels.ledger},'foundationLotterySellerSyncOperation')
        and ((model='foundationAccountingOrganization' and id=${organization})
          or value->>'organizationId'=${organization})
    ), budget as (
      select coalesce(sum(octet_length(value::text)),0) <= 8000000 as safe from operational
    )
    select budget.safe,operational.model,operational.value
      from budget left join operational on budget.safe order by operational.ordinal
  `;
  if (!records[0]?.safe) return { version: saved.version, state: {}, overBudget: true };
  const state: Record<string, unknown[]> = {};
  for (const row of records) {
    if (row.model !== null) (state[String(row.model)] ??= []).push(row.value);
  }
  return { version: saved.version, state };
}

/** The version and page use one MVCC snapshot. Writes invalidate continuation, never silently mix snapshots. */
export async function readLotteryHistory(tx: postgres.TransactionSql, owner: string, request: HistoryRequest) {
  const { organizationId: organization, kind, search, cursor } = request;
  const ordinal = cursor?.ordinal ?? '0';
  const offset = cursor?.offset ?? 0;
  const expected = cursor?.revision ?? null;
  const rows = await tx<{ revision: string; id: string | null; ordinal: string; json: string; length: number; offset: number }[]>`
    with authorized as (
      select s.version from public.khata_lottery_state s
      join public.khata_lottery_records org on org.owner_id=s.owner_id
      where s.owner_id=${owner}::uuid and org.model='foundationAccountingOrganization'
        and org.id=${organization} and org.value->>'status'='ACTIVE'
    )
    select authorized.version::text as revision, page.*
    from authorized left join lateral (
      select id, ordinal::text as ordinal,
        substring(value::text from (case when ordinal=${ordinal}::bigint then ${offset}::int else 0 end)+1
          for ${historyFragmentSize}::int) as json,
        length(value::text) as length,
        case when ordinal=${ordinal}::bigint then ${offset}::int else 0 end as offset
      from public.khata_lottery_records
      where owner_id=${owner}::uuid and model=${historyModels[kind]} and value->>'organizationId'=${organization}
        and ordinal >= ${ordinal}::bigint
        and (${expected}::bigint is null or authorized.version=${expected}::bigint)
        and (${search}='' or strpos(lower(value::text),lower(${search}))>0)
      order by khata_lottery_records.ordinal
      limit ${historyPageRows + 1}
    ) page on true
  `;
  const first = rows[0];
  if (!first) return { lotteryError: 'ORGANIZATION_NOT_FOUND' };
  if (expected !== null && expected !== first.revision) return { lotteryError: 'LOTTERY_HISTORY_CHANGED' };
  const found = rows.filter((row): row is typeof row & { id: string } => row.id !== null);
  if (offset && (found[0]?.ordinal !== ordinal || offset >= found[0].length)) return { lotteryError: 'LOTTERY_HISTORY_CURSOR_INVALID' };
  return historyPage(first.revision, found);
}
