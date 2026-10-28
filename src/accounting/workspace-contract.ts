import { expenseCommand } from './expense-model.ts';
import { inventoryCommand } from '../inventory/model.ts';
type PaymentAccount = { id: string; name: string; kind: 'cash' | 'bank'; channel: string; active: boolean };
type Numbering = { sale: string; purchase: string; expense: string };
export type WorkspaceSettings = { accounts: PaymentAccount[]; numbering: Numbering; next: Numbering };
export const defaultSettings = (): WorkspaceSettings => ({ accounts: [{ id: 'cash', name: 'Cash', kind: 'cash', channel: '', active: true }, { id: 'bank', name: 'Bank', kind: 'bank', channel: '', active: true }], numbering: { sale: 'S-', purchase: 'P-', expense: 'E-' }, next: { sale: '1', purchase: '1', expense: '1' } });
export function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const text = (value: unknown, limit: number) => typeof value === 'string' && value.length <= limit && !/[<>]/u.test(value) && Array.from(value).every(char => (char.codePointAt(0) ?? 0) >= 32);
export function validSettings(value: unknown): value is WorkspaceSettings {
    if (!object(value) || !Array.isArray(value.accounts) || value.accounts.length < 2 || value.accounts.length > 30 || !object(value.numbering) || !object(value.next)) return false;
    const ids = new Set<string>();
    for (const row of value.accounts) {
        if (!object(row) || !text(row.id, 50) || !row.id || ids.has(String(row.id)) || !text(row.name, 60) || !String(row.name).trim() || !['cash', 'bank'].includes(String(row.kind)) || !text(row.channel, 40) || typeof row.active !== 'boolean') return false;
        ids.add(String(row.id));
    }
    return ['cash', 'bank'].every(id => value.accounts instanceof Array && value.accounts.some(row => row.id === id && row.kind === id)) && ['sale', 'purchase', 'expense'].every(key => object(value.numbering) && text(value.numbering[key], 20) && object(value.next) && typeof value.next[key] === 'string' && /^[1-9]\d{0,7}$/u.test(value.next[key]));
}
export function workspaceInput(p: Record<string, unknown>): boolean {
    if (!uuid(p.company) || typeof p.action !== 'string') return false;
    switch (p.action) {
        case 'settings': return Object.keys(p).length === 2;
        case 'accounts': return Object.keys(p).length === 2 || Object.keys(p).length === 4 && /^\d{4}-\d{2}-\d{2}$/u.test(String(p.from)) && /^\d{4}-\d{2}-\d{2}$/u.test(String(p.to)) && String(p.from) <= String(p.to);
        case 'settings-save': return Object.keys(p).length === 3 && validSettings(p.settings);
        case 'number': return Object.keys(p).length === 4 && uuid(p.id) && ['sale', 'purchase', 'expense'].includes(String(p.kind));
        case 'expense': return Object.keys(p).length === 5 && uuid(p.id) && object(p.command) && p.command.id === p.id && p.command.company === p.company && Boolean(expenseCommand(p.command)) && Array.isArray(p.lines) && p.lines.length <= 50;
        case 'payment': return Object.keys(p).length === 10 && uuid(p.id) && uuid(p.party) && ['receipt', 'payment'].includes(String(p.kind)) && typeof p.amount === 'string' && /^[1-9]\d{0,11}$/u.test(p.amount) && text(p.account, 50) && text(p.reference, 80) && text(p.note, 500) && /^\d{4}-\d{2}-\d{2}$/u.test(String(p.date));
        case 'detail': return Object.keys(p).length === 3 && uuid(p.id);
        case 'retire': case 'restore': return Object.keys(p).length === 3 && text(p.name, 120);
        case 'bill': return Object.keys(p).length === 6 && object(p.bill) && p.bill.company === p.company && Boolean(inventoryCommand(p.bill)) && ['sale', 'purchase'].includes(String(p.bill.kind)) && typeof p.paid === 'string' && /^(0|[1-9]\d{0,11})$/u.test(p.paid) && text(p.account, 50) && /^-?\d{1,4}$/u.test(String(p.roundoff));
        case 'correct': return Object.keys(p).length === 7 && uuid(p.id) && uuid(p.target) && ['voucher', 'expense'].includes(String(p.type)) && text(p.reason, 250) && Boolean(String(p.reason).trim()) && (p.replacement === null || object(p.replacement) && workspaceInput(p.replacement) && p.replacement.company === p.company && ['bill', 'payment', 'expense'].includes(String(p.replacement.action)));
        default: return false;
    }
}
