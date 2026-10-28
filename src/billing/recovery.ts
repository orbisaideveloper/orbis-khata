import { khataOperation, type KhataOperation } from '../accounting/server-gateway';
const key = (user: string) => `khata-bill-recovery-v1:${user}`;
export function restoreBill(user: string): KhataOperation | null {
    try {
        const raw = sessionStorage.getItem(key(user));
        if (!raw || raw.length > 196608) {
            return null;
        }
        const value = khataOperation(JSON.parse(decodeURIComponent(raw)));
        return value && ['inventory-post', 'expense-bill', 'workspace'].includes(value.operation) && (value.operation !== 'workspace' || value.input.action === 'bill') ? value : null;
    }
    catch {
        return null;
    }
}
export function retainBill(user: string, value: KhataOperation) {
    if (!['inventory-post', 'expense-bill', 'workspace'].includes(value.operation) || !khataOperation({ version: 'orbis.khata.data.v1', ...value })) {
        throw new Error('INVALID_BILL');
    }
    sessionStorage.setItem(key(user), encodeURIComponent(JSON.stringify({ version: 'orbis.khata.data.v1', ...value })));
}
export function clearBill(user: string) { sessionStorage.removeItem(key(user)); }
