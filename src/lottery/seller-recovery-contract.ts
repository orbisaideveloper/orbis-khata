import { accountingBusinessDate } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate.ts';
export type SellerRecoveryRequest = { organizationId: string; partyId: string; occurredAt: string; saleId?: string };
export type RecoverySale = { id: string; partyId: string; reference: string; occurredAt: string; status: string;
  syncVersion?: number; dispatchQuantity: number; morningReturnQuantity: number; dayReturnQuantity: number;
  eveningReturnQuantity: number; commissionPaise: string };
export type SellerRecoverySnapshot = {
  organization: { id: string; userLedgerStorage: string }; partyId: string; occurredAt: string;
  draftSales: RecoverySale[]; sales: RecoverySale[]; referencedSale?: RecoverySale;
};
export function validateRecoverySnapshot(snapshot: SellerRecoverySnapshot, request: SellerRecoveryRequest) {
  if (!snapshot || snapshot.organization?.id !== request.organizationId || snapshot.organization.userLedgerStorage !== 'CLOUD' ||
      snapshot.partyId !== request.partyId || snapshot.occurredAt !== request.occurredAt ||
      !Array.isArray(snapshot.draftSales) || !Array.isArray(snapshot.sales)) throw new Error('RECOVERY_SCOPE_INVALID');
  const sales = [...snapshot.draftSales, ...snapshot.sales];
  if (sales.length > 1) throw new Error('RECOVERY_AMBIGUOUS');
  for (const sale of [...sales, ...(snapshot.referencedSale ? [snapshot.referencedSale] : [])]) validateRecoverySale(sale, request.partyId);
  if (sales.some(sale=>!['DRAFT','POSTED'].includes(sale.status) || accountingBusinessDate(sale.occurredAt)!==request.occurredAt) ||
    snapshot.referencedSale && snapshot.referencedSale.id !== request.saleId) throw new Error('RECOVERY_SCOPE_INVALID');
}

function validateRecoverySale(sale: RecoverySale, partyId: string) {
    if (sale?.partyId !== partyId || typeof sale.id !== 'string' || typeof sale.reference !== 'string' ||
      !accountingBusinessDate(sale.occurredAt) || !Number.isSafeInteger(sale.syncVersion) || (sale.syncVersion ?? -1) < 0 ||
      ![sale.dispatchQuantity, sale.morningReturnQuantity, sale.dayReturnQuantity, sale.eveningReturnQuantity].every(n=>Number.isSafeInteger(n)&&n>=0) ||
      typeof sale.commissionPaise !== 'string' || !/^\d+$/u.test(sale.commissionPaise)) throw new Error('RECOVERY_RESPONSE_INVALID');
}
