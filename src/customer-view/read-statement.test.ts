// @vitest-environment node
import { expect, it } from 'vitest';
import { runLottery } from '../lottery/service';
import { readSharedStatement } from './read-statement';
import type { LotteryInput } from '../lottery/protocol';
it('reads existing domain calculations without materializing expenses, duplicating accounts or changing source state', async () => {
    let state: unknown = {};
    const owner = '11111111-1111-7111-8111-111111111111';
    async function command(method: string, payload: Record<string, unknown> = {}) { const result = await runLottery(state, { method, payload, operationId: crypto.randomUUID() } as LotteryInput, owner, () => new Date('2026-10-30T10:00:00Z')); state = result.state; return result.result; }
    const org = await command('createOrganization', { name: 'Original books' });
    const seller = await command('createParty', { organizationId: org.id, name: 'Viewer', partyType: 'SELLER', ticketRatePaise: '1000', openingBalancePaise: '5000', openingBalanceDate: '2026-10-01' });
    const stockist = await command('createParty', { organizationId: org.id, name: 'PRIVATE supplier', partyType: 'STOCKIST', ticketRatePaise: '800' });
    await command('createParty', { organizationId: org.id, name: 'PRIVATE party', partyType: 'SELLER' });
    await command('saveDailyStockistEntry', { organizationId: org.id, partyId: stockist.id, occurredAt: '2026-10-30', purchaseQuantity: '20', morningReturnQuantity: '0', dayReturnQuantity: '0', eveningReturnQuantity: '0', commissionPaise: '0' });
    await command('recordSale', { organizationId: org.id, partyId: seller.id, occurredAt: '2026-10-30', dispatchQuantity: '10', morningReturnQuantity: '1', dayReturnQuantity: '0', eveningReturnQuantity: '0', commissionPaise: '1000' });
    await command('recordPayment', { organizationId: org.id, partyId: seller.id, direction: 'RECEIPT', totalAmountPaise: '1000', occurredAt: '2026-10-30', methodSplit: { cashPaise: '1000' } });
    const category = await command('createExpenseCategory', { organizationId: org.id, name: 'PRIVATE expense' });
    await command('createExpenseProfile', { organizationId: org.id, categoryId: category.id, name: 'PRIVATE worker', usualAmountPaise: '500', scheduleType: 'MONTHLY' });
    const before = JSON.stringify(state), result = await readSharedStatement(state, org.id, seller.id, '2026-10-30', '2026-10-30', 0);
    expect(result).toMatchObject({ opening: '5000', balance: '12020', total: 2, sourceRole: 'Stockist', direction: 'pay' });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|summary|expenseBills|ledgerEntries|auditEvents|parties/);
    expect(JSON.stringify(state)).toBe(before);
    await expect(readSharedStatement(state, 'missing', seller.id, '2026-10-01', '2026-10-31', 0)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
});
