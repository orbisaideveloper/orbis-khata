import type postgres from 'npm:postgres@3.4.7';
import { decodeLottery } from '../../../src/lottery/domain-store.ts';
import { accountingBusinessDate } from '../../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate.ts';
import { validateRecoverySnapshot, type RecoverySale, type SellerRecoveryRequest, type SellerRecoverySnapshot } from '../../../src/lottery/seller-recovery-contract.ts';

/** A single owner-scoped statement; never exports the owner's complete accounting state. */
export async function readSellerRecovery(tx: postgres.TransactionSql, owner: string, request: SellerRecoveryRequest) {
 const rows = await tx<{kind: string; value: unknown}[]>`
  with owned as (
   select value from public.khata_lottery_records where owner_id=${owner}::uuid
    and model='foundationAccountingOrganization' and id=${request.organizationId}
  ), party as (
   select value from public.khata_lottery_records where owner_id=${owner}::uuid
    and model='foundationAccountingParty' and id=${request.partyId}
    and value->>'organizationId'=${request.organizationId} and exists(select 1 from owned)
  )
  select 'organization' as kind, value from owned
  union all select 'party' as kind, value from party
  union all (select 'sale' as kind, value from public.khata_lottery_records
   where owner_id=${owner}::uuid and model='foundationLotterySale'
    and value->>'organizationId'=${request.organizationId} and value->>'partyId'=${request.partyId}
    and exists(select 1 from party)
    and (id=${request.saleId ?? ''} or (value->>'status' in ('DRAFT','POSTED') and
     ((value->'occurredAt'->>'value')::timestamptz at time zone 'Asia/Kolkata')::date=${request.occurredAt}::date))
   limit 3)
 `;
 return projectSellerRecovery(rows, request);
}

export function projectSellerRecovery(rows: {kind: string; value: unknown}[], request: SellerRecoveryRequest): SellerRecoverySnapshot {
 const org = decodeLottery(rows.find(row=>row.kind==='organization')?.value);
 const party = decodeLottery(rows.find(row=>row.kind==='party')?.value);
 if (!org || org.id!==request.organizationId || !party || party.id!==request.partyId || party.organizationId!==org.id) throw new Error('RECOVERY_SCOPE_INVALID');
 const sales: RecoverySale[] = rows.filter(row=>row.kind==='sale').map(row=>{
  const sale=decodeLottery(row.value);
  if (sale.organizationId!==org.id || sale.partyId!==party.id) throw new Error('RECOVERY_SCOPE_INVALID');
  return { id: sale.id, partyId: sale.partyId, reference: sale.reference, occurredAt: accountingBusinessDate(sale.occurredAt),
   status: sale.status, syncVersion: sale.syncVersion ?? 1, dispatchQuantity: sale.dispatchQuantity,
   morningReturnQuantity: sale.morningReturnQuantity, dayReturnQuantity: sale.dayReturnQuantity,
   eveningReturnQuantity: sale.eveningReturnQuantity, commissionPaise: String(sale.commissionPaise) };
 });
 const daily=sales.filter(sale=>['DRAFT','POSTED'].includes(sale.status)&&sale.occurredAt===request.occurredAt);
 const snapshot={organization:{id:org.id,userLedgerStorage:org.userLedgerStorage},partyId:party.id,occurredAt:request.occurredAt,
  draftSales:daily.filter(sale=>sale.status==='DRAFT'),sales:daily.filter(sale=>sale.status==='POSTED'),
  ...(request.saleId ? {referencedSale:sales.find(sale=>sale.id===request.saleId)} : {})};
 validateRecoverySnapshot(snapshot, request);
 return snapshot;
}
