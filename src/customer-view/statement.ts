import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes';
import { accountingBusinessDate } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate.ts';
type Row = {
    id: string;
    date: string;
    reference: string;
    kind: 'opening' | 'POSTED' | 'DRAFT' | 'purchase' | 'bill' | 'payment';
    business: string;
    money: string;
    quantity?: string;
    returned?: string;
    netQuantity?: string;
    gross?: string;
    rate?: string;
    commission?: string;
    tds?: string;
    split?: Record<string, string>;
    balance: string;
};
export type PartyStatement = {
    party: string;
    source: string;
    sourceRole: 'Stockist' | 'Customer';
    direction: 'pay' | 'receive';
    from: string;
    to: string;
    opening: string;
    balance: string;
    rows: Row[];
    total: number;
    next: number | null;
};
type Event = Omit<Row, 'balance'>;
function businessEvents(workspace: LotteryWorkspace, partyId: string, type: string): Event[] {
    if (type === 'SELLER') {
        return [...workspace.sales, ...workspace.draftSales].filter(row => row.partyId === partyId).map(sale => ({ id: 'sale-' + sale.id, date: accountingBusinessDate(sale.occurredAt), reference: sale.reference, kind: sale.status, business: sale.netPayablePaise, money: '0', quantity: String(sale.dispatchQuantity), returned: String(sale.returnQuantity), netQuantity: String(sale.netTickets), gross: sale.grossSalesPaise, rate: sale.ticketRatePaise, commission: sale.commissionPaise, tds: sale.tdsPaise }));
    }
    if (type === 'CUSTOMER') {
        return workspace.customerBills.filter(row => row.partyId === partyId).map(row => ({ id: 'bill-' + row.id, date: accountingBusinessDate(row.occurredAt), reference: row.reference, kind: 'bill', business: row.amountPaise, money: '0', quantity: row.quantity, rate: row.unitRatePaise }));
    }
    return workspace.stockistEntries.filter(row => row.partyId === partyId).map(row => ({ id: 'purchase-' + row.id, date: accountingBusinessDate(row.occurredAt), reference: row.reference, kind: 'purchase', business: row.netPayablePaise, money: '0', quantity: row.purchaseQuantity, returned: row.totalReturnQuantity, netQuantity: row.netPurchaseQuantity, gross: row.grossPurchasePaise, rate: row.unitRatePaise, commission: row.commissionPaise, tds: row.tdsPaise }));
}
function payments(workspace: LotteryWorkspace, partyId: string, supplier: boolean): Event[] {
    const direction = supplier ? 'PAYMENT' : 'RECEIPT';
    return workspace.payments.filter(row => row.partyId === partyId && row.direction === direction).map(row => ({ id: 'payment-' + row.id, date: accountingBusinessDate(row.occurredAt), reference: row.reference, kind: 'payment', business: '0', money: row.totalAmountPaise, split: Object.fromEntries(['cashPaise', 'bankPaise', 'pwtPaise', 'upiPaise', 'chequePaise'].map(key => [key, row.methodSplit[key] ?? '0'])) }));
}
function rollForward(events: Event[], from: string, to: string) {
    events.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference, undefined, { numeric: true }) || a.id.localeCompare(b.id));
    let balance = 0n, opening = 0n;
    const rows: Row[] = [];
    for (const row of events) {
        if (row.date > to) {
            continue;
        }
        balance += BigInt(row.business) - BigInt(row.money);
        if (row.date < from) {
            opening = balance;
            continue;
        }
        rows.push({ ...row, balance: String(balance) });
    }
    return { rows, balance: String(balance), opening: String(opening) };
}
/** Only this explicit projection may cross the sharing boundary. No workspace spread. */
export function partyStatement(workspace: LotteryWorkspace, partyId: string, from: string, to: string, offset = 0): PartyStatement {
    const party = workspace.parties.find(row => row.id === partyId);
    if (!party) {
        throw new Error('SHARE_NOT_AVAILABLE');
    }
    const supplier = party.partyType === 'STOCKIST' || party.partyType === 'SERVICE_STOCKIST';
    const events = businessEvents(workspace, partyId, party.partyType).concat(payments(workspace, partyId, supplier));
    if (party.openingBalanceDate) {
        events.push({ id: 'opening', date: party.openingBalanceDate, reference: '', kind: 'opening', business: party.openingBalancePaise ?? '0', money: '0' });
    }
    const { rows, balance, opening } = rollForward(events, from, to);
    return { party: party.name, source: workspace.organization.name, sourceRole: supplier ? 'Customer' : 'Stockist', direction: supplier ? 'receive' : 'pay', from, to, opening, balance, rows: rows.slice(offset, offset + 100), total: rows.length, next: offset + 100 < rows.length ? offset + 100 : null };
}
