import { expect, it } from 'vitest';
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes';
import { partyStatement } from './statement';
import { khataOperation } from '../accounting/server-gateway';
const id = '11111111-1111-4111-8111-111111111111';
function fixture() { return { organization: { name: 'Source', private: 'secret' }, parties: [{ id: 'own', name: 'Viewer', partyType: 'SELLER', openingBalanceDate: '2026-10-01', openingBalancePaise: '10000' }, { id: 'other', name: 'PRIVATE', phone: 'PRIVATE' }], sales: [{ id: 'sale', partyId: 'own', reference: 'S1', occurredAt: '2026-10-30T20:00:00Z', status: 'POSTED', netPayablePaise: '5000', dispatchQuantity: 10, returnQuantity: 2, ticketRatePaise: '625', commissionPaise: '0', tdsPaise: '0' }, { id: 'secret-sale', partyId: 'other', netPayablePaise: '999999' }], draftSales: [], customerBills: [], stockistEntries: [], payments: [{ id: 'payment', partyId: 'own', reference: 'P1', occurredAt: '2026-10-31', direction: 'RECEIPT', totalAmountPaise: '2000', methodSplit: { cashPaise: '1000', pwtPaise: '1000', private: 'secret' } }, { id: 'private', partyId: 'other' }], summary: { private: 'secret' } } as unknown as LotteryWorkspace; }
it('projects only the linked party, preserves source, India dates, PWD and exact running balances', () => { const workspace = fixture(), before = structuredClone(workspace); const result = partyStatement(workspace, 'own', '2026-10-31', '2026-10-31'); expect(result).toMatchObject({ sourceRole: 'Stockist', direction: 'pay', opening: '10000', balance: '13000', total: 2 }); expect(result.rows.map(row => row.balance)).toEqual(['8000', '13000']); expect(result.rows.find(row => row.kind === 'payment')?.split).toMatchObject({ pwtPaise: '1000' }); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|secret|secret-sale/); expect(workspace).toEqual(before); expect(() => partyStatement(workspace, 'missing', '2026-01-01', '2026-12-31')).toThrow('SHARE_NOT_AVAILABLE'); });
it('supports supplier and customer perspective, advances and pagination without losing carry forward', () => { const workspace = fixture(); workspace.sales = []; workspace.payments = []; workspace.parties[0].partyType = 'STOCKIST'; workspace.parties[0].openingBalancePaise = '-500'; workspace.stockistEntries = Array.from({ length: 101 }, (_, index) => ({ id: String(index), partyId: 'own', reference: String(index), occurredAt: '2026-10-31', netPayablePaise: '100', purchaseQuantity: '1', totalReturnQuantity: '0', unitRatePaise: '100', commissionPaise: '0', tdsPaise: '0', partyName: 'Viewer', morningReturnQuantity: '0', dayReturnQuantity: '0', eveningReturnQuantity: '0', netPurchaseQuantity: '1', grossPurchasePaise: '100', tdsRateBps: 0, source: 'DAILY' as const })); const result = partyStatement(workspace, 'own', '2026-10-31', '2026-10-31', 100); expect(result).toMatchObject({ sourceRole: 'Customer', direction: 'receive', opening: '-500', balance: '9600', total: 101, next: null }); expect(result.rows).toHaveLength(1); expect(result.rows[0].balance).toBe('9600'); workspace.parties[0].partyType = 'CUSTOMER'; workspace.customerBills = [{ id: 'bill', partyId: 'own', reference: 'B', occurredAt: '2026-10-31', amountPaise: '1000', quantity: '2', unitRatePaise: '500' }] as LotteryWorkspace['customerBills']; expect(partyStatement(workspace, 'own', '2026-10-31', '2026-10-31')).toMatchObject({ balance: '500', direction: 'pay' }); });
it('validates every sharing action and blocks identity/owner injection and malformed periods', () => {
    const envelope = (input: unknown) => khataOperation({ version: 'orbis.khata.data.v1', operation: 'party-sharing', input });
    for (const action of ['list', 'choices'])
        expect(envelope({ action })).not.toBeNull();
    for (const action of ['accept', 'decline', 'revoke'])
        expect(envelope({ action, id })).not.toBeNull();
    const invite = { action: 'invite', id, organization: id, party: id, recipient: 'ORB-U-23456789' };
    expect(envelope(invite)).not.toBeNull();
    for (const patch of [{ owner_id: id }, { recipientIdentity: id }, { recipient: 'ORB-U-INVALID1' }, { party: 'bad' }])
        expect(envelope({ ...invite, ...patch })).toBeNull();
    const statement = { action: 'statement', id, from: '2026-10-01', to: '2026-10-31', offset: 0 };
    expect(envelope(statement)).not.toBeNull();
    for (const patch of [{ from: '2026-02-30' }, { to: '2026-09-01' }, { offset: -1 }, { offset: 1.5 }, { offset: 1000001 }, { organization: id }])
        expect(envelope({ ...statement, ...patch })).toBeNull();
    for (const action of ['post', 'toString', '__proto__', null, {}]) {
        expect(envelope({ action, id })).toBeNull();
    }
});
