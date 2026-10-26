import type { DemoItem, DemoParty } from './demo/master-model.ts';
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max && !/[<>]/u.test(v) && !Array.from(v).some(c => { const n = (c.codePointAt(0) ?? 0); return n < 9 || n === 11 || n === 12 || n > 13 && n < 32 || n === 127; });
const money = (v: unknown) => v === null || typeof v === 'string' && /^(0|[1-9]\d{0,11})$/u.test(v);
export function masterIdentity(p: Record<string, unknown>) { return uuid(p.id) && uuid(p.company); }
export function itemInput(p: Record<string, unknown>): p is Record<string, unknown> & DemoItem { return masterIdentity(p) && Object.keys(p).every(k => ['id', 'company', 'name', 'code', 'unit', 'default_rate'].includes(k)) && text(p.name, 120) && Boolean(String(p.name).trim()) && text(p.code, 40) && text(p.unit, 24) && Boolean(String(p.unit).trim()) && money(p.default_rate); }
export function partyInput(p: Record<string, unknown>): p is Record<string, unknown> & DemoParty {
    return masterIdentity(p) && Object.keys(p).every(k => ['id', 'company', 'name', 'kind', 'phone', 'email', 'address', 'credit_limit', 'credit_days', 'opening_amount', 'opening_side', 'opening_date', 'opening_account', 'receivable', 'payable'].includes(k)) &&
        text(p.name, 120) && Boolean(String(p.name).trim()) && ['customer', 'supplier', 'both', 'expense'].includes(String(p.kind)) && text(p.phone, 30) && text(p.email, 120) && text(p.address, 400) && money(p.credit_limit) &&
        (p.credit_days === null || Number.isInteger(p.credit_days) && Number(p.credit_days) >= 0 && Number(p.credit_days) <= 3650) && typeof p.opening_amount === 'string' && money(p.opening_amount) &&
        ['none', 'due', 'advance'].includes(String(p.opening_side)) && ['receivable', 'payable', 'expense_payable'].includes(String(p.opening_account)) && typeof p.opening_date === 'string' && (p.opening_date === '' || /^\d{4}-\d{2}-\d{2}$/u.test(p.opening_date));
}
