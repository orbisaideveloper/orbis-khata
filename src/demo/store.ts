import { defaultSettings, type WorkspaceSettings } from '../accounting/workspace-contract';
import { textValue } from '../text-value';
import { emptyPartyDetails, type DemoItem, type DemoParty } from './master-model';
import { pendingCommand } from '../accounting/pending-command';
import type { Company, Command, Report, Voucher } from '../accounting/model';
import { expenseCommand, type ExpenseCommand, type ExpenseReport } from '../accounting/expense-model';
import type { InventoryCommand, InventoryReport } from '../inventory/model';
import { billTotal, inventoryCommand, lineTotal } from '../inventory/model';
const companyId = '11111111-1111-4111-8111-111111111111';
const warehouseId = '22222222-2222-4222-8222-222222222222';
let workspaceSettings: Record<string, WorkspaceSettings> = {};
let workspaceEvents: Record<string, {
    payload: string;
    result: unknown;
}> = {};
let paymentLinks: Record<string, {
    bill: string | null;
    account: string;
}> = {};
let retired: Record<string, string> = {};
let companies: Company[] = [];
let parties: DemoParty[] = [];
let entries: (Voucher & {
    company: string;
})[] = [];
let expenses: ExpenseCommand[] = [];
let expenseBillLines: Record<string, {
    description: string;
    quantity: string;
    unit: string;
    rate: string;
    unit_rate?: string;
}[]> = {};
let documents: InventoryReport['documents'] = [];
const inventoryReversals = new Map<string, string>();
let items: DemoItem[] = [];
let warehouses: (InventoryReport['warehouses'][number] & {
    company: string;
})[] = [];
export function resetDemo() {
    workspaceSettings = {};
    workspaceEvents = {};
    paymentLinks = {};
    retired = {};
    inventoryReversals.clear();
    expenseBillLines = {};
    companies = [{ id: companyId, name: 'ডেমো দোকান' }];
    parties = [];
    entries = [];
    expenses = [];
    documents = [];
    items = [];
    warehouses = [{ id: warehouseId, company: companyId, code: 'MAIN', name: 'প্রধান গোডাউন' }];
    for (const key of Object.keys(sessionStorage)) {
        if (key.includes('demo-owner')) {
            sessionStorage.removeItem(key);
        }
    }
}
if (import.meta.env.DEV) {
    resetDemo();
}
function fail(message: string): never { throw Object.assign(new Error(message), { code: '23514' }); }
function stockMoves(company: string) {
    return documents.filter(d => d.company === company).flatMap(d => {
        const base = d.lines.flatMap(l => { const sign = d.kind === 'sale' || d.kind === 'transfer' ? -1n : 1n; return [{ date: d.date, item: l.item, warehouse: l.warehouse, amount: sign * BigInt(l.quantity) }, ...(d.kind === 'transfer' && l.to ? [{ date: d.date, item: l.item, warehouse: l.to, amount: BigInt(l.quantity) }] : [])]; });
        const reversedAt = inventoryReversals.get(d.id);
        return reversedAt ? [...base, ...base.map(m => ({ ...m, date: reversedAt, amount: -m.amount }))] : base;
    });
}
function inventory(company: string, from: string, to: string, offset: number): InventoryReport {
    const selected = documents.filter(d => d.company === company && d.date >= from && d.date <= to), moves = stockMoves(company);
    return { items: items.filter(i => i.company === company).map(i => ({ id: i.id, code: i.code, name: i.name, unit: i.unit, default_rate: i.default_rate })), warehouses: warehouses.filter(w => w.company === company).map(w => ({ id: w.id, code: w.code, name: w.name })), stocks: items.filter(i => i.company === company).flatMap(i => warehouses.filter(w => w.company === company).map(w => {
            const all = moves.filter(m => m.item === i.id && m.warehouse === w.id && m.date <= to), period = all.filter(m => m.date >= from);
            return { item: i.id, warehouse: w.id, opening: String(all.filter(m => m.date < from).reduce((n, m) => n + m.amount, 0n)), incoming: String(period.filter(m => m.amount > 0n).reduce((n, m) => n + m.amount, 0n)), outgoing: String(-period.filter(m => m.amount < 0n).reduce((n, m) => n + m.amount, 0n)), closing: String(all.reduce((n, m) => n + m.amount, 0n)) };
        })), documents: selected.slice(offset, offset + 50).map(d => ({ ...d, reversed: Boolean(inventoryReversals.get(d.id) && inventoryReversals.get(d.id)! <= to) })), count: selected.length };
}
function partyBalances(rows: Pick<Voucher, 'debit_account' | 'credit_account' | 'amount_minor' | 'effective_date'>[], from: string, to: string): Report['balances'] {
    const balances: Report['balances'] = {};
    for (const row of rows.filter(row => row.effective_date <= to)) {
        for (const [account, sign] of [[row.debit_account, 1n], [row.credit_account, -1n]] as const) {
            const balance = balances[account] ??= { opening: '0', movement: '0', closing: '0' }, value = BigInt(row.amount_minor) * sign;
            balance.closing = String(BigInt(balance.closing) + value);
            const period = row.effective_date < from ? 'opening' : 'movement';
            balance[period] = String(BigInt(balance[period]) + value);
        }
    }
    return balances;
}
function expenseJournal(company: string) {
    return expenses.filter(e => e.company === company).flatMap(e => {
        const original = e.kind === 'reversal' ? expenses.find(p => p.id === e.parent) : e;
        if (!original) {
            return [];
        }
        const pair: readonly [
            Voucher['debit_account'],
            Voucher['credit_account']
        ] = original.kind === 'charge' ? ['expenses', original.method ?? 'expense_payable'] : ['expense_payable', original.method ?? 'cash'];
        return [{ party_id: parties.find(p => p.company === company && p.kind === 'expense' && p.name === e.payee)?.id, effective_date: e.date, amount_minor: e.amount, debit_account: e.kind === 'reversal' ? pair[1] : pair[0], credit_account: e.kind === 'reversal' ? pair[0] : pair[1] }];
    });
}
function report(company: string, from: string, to: string, party: string | null, offset: number): Report {
    const current = entries.filter(e => e.company === company);
    const expenseRows = expenseJournal(company);
    const openingRows = parties.filter(p => p.company === company && p.opening_side !== 'none' && BigInt(p.opening_amount) > 0n).map(p => {
        const account = openingAccount(p);
        const debit = account === 'receivable' ? p.opening_side === 'due' : p.opening_side === 'advance';
        return { party_id: p.id, effective_date: p.opening_date, amount_minor: p.opening_amount, debit_account: debit ? account : 'opening_equity', credit_account: debit ? 'opening_equity' : account } as Pick<Voucher, 'party_id' | 'debit_account' | 'credit_account' | 'amount_minor' | 'effective_date'>;
    });
    const balances = partyBalances([...current, ...expenseRows, ...openingRows], from, to);
    const selected = current.filter(e => e.effective_date >= from && e.effective_date <= to && (!party || e.party_id === party));
    const partyList = parties.filter(p => p.company === company).map(p => {
        const amount = (account: string) => String([...current, ...openingRows].filter(e => e.party_id === p.id && e.effective_date <= to).reduce((n, e) => n + (e.debit_account === account ? BigInt(e.amount_minor) : 0n) - (e.credit_account === account ? BigInt(e.amount_minor) : 0n), 0n));
        return { ...p, receivable: amount('receivable'), payable: String(-BigInt(amount('payable'))) };
    });
    return { balances, opening_entries: parties.filter(p => p.company === company && (!party || p.id === party) && p.opening_side !== 'none' && p.opening_date <= to && BigInt(p.opening_amount) > 0n).map(p => ({ id: 'opening:' + p.id, party_id: p.id, date: p.opening_date, side: p.opening_side as 'due' | 'advance', amount: p.opening_amount })), ledger_balances: party ? partyBalances([...current, ...expenseRows, ...openingRows].filter(e => e.party_id === party), from, to) : balances, parties: partyList, entries: selected.slice(offset, offset + 50), count: selected.length, as_of: to };
}
function expenseReport(company: string, from: string, to: string, offset: number): ExpenseReport {
    const all = expenses.filter(e => e.company === company && e.date <= to);
    const active = all.filter(e => e.kind !== 'reversal' && !all.some(r => r.kind === 'reversal' && r.parent === e.id));
    const journal = expenseJournal(company);
    const opening = parties.filter(p => p.company === company && p.kind === 'expense' && p.opening_side !== 'none').map(p => ({ effective_date: p.opening_date, amount_minor: p.opening_amount, debit_account: p.opening_side === 'due' ? 'opening_equity' : 'expense_payable', credit_account: p.opening_side === 'due' ? 'expense_payable' : 'opening_equity' } as Pick<Voucher, 'effective_date' | 'amount_minor' | 'debit_account' | 'credit_account'>));
    const computed = partyBalances([...journal, ...opening], from, to);
    const balances = Object.fromEntries(['expenses', 'cash', 'bank', 'expense_payable'].map(account => [account, computed[account as keyof typeof computed] ?? { opening: '0', movement: '0', closing: '0' }]));
    const period = all.filter(e => e.date >= from);
    const categoryMovements = period.flatMap(e => { const original = e.kind === 'reversal' ? all.find(r => r.id === e.parent) : e; return original?.kind === 'charge' ? [{ name: original.category, amount: BigInt(e.amount) * (e.kind === 'reversal' ? -1n : 1n) }] : []; });
    const bills = active.filter(e => e.kind === 'charge').map(e => { const payments = active.filter(p => p.kind === 'payment' && p.parent === e.id).reduce((n, p) => n + BigInt(p.amount), 0n); return { id: e.id, effective_date: e.date, category: e.category, payee: e.payee, amount: e.amount, due: String((e.method ? 0n : BigInt(e.amount)) - payments) }; }).filter(e => BigInt(e.due) > 0n);
    const openingBills = parties.filter(p => p.company === company && p.kind === 'expense' && p.opening_side === 'due' && p.opening_date <= to).map(p => ({ id: p.id, effective_date: p.opening_date, category: p.name, payee: p.name, amount: p.opening_amount, due: String(BigInt(p.opening_amount) - active.filter(e => e.kind === 'payment' && e.parent === p.id).reduce((n, e) => n + BigInt(e.amount), 0n)) })).filter(b => BigInt(b.due) > 0n);
    bills.push(...openingBills);
    const categories = [...new Set(categoryMovements.map(e => e.name))].map(name => ({ name, amount: String(categoryMovements.filter(e => e.name === name).reduce((sum, e) => sum + e.amount, 0n)) }));
    const ranged = all.filter(e => e.date >= from);
    return { balances, categories, bills, entries: ranged.slice(offset, offset + 50).map(e => ({ bill_lines: expenseBillLines[e.id], id: e.id, kind: e.kind, amount: e.amount, category: e.category, payee: e.payee, method: (e.kind === 'reversal' ? all.find(original => original.id === e.parent)?.method : e.method) ?? null, reference: e.reference, note: e.note, effective_date: e.date, parent_id: e.parent, reverses_id: e.kind === 'reversal' ? e.parent : null, reversed: all.some(r => r.kind === 'reversal' && r.parent === e.id) })), count: ranged.length };
}
export async function saveDemoExpenseBill(command: ExpenseCommand, lines: {
    description: string;
    quantity: string;
    unit: string;
    rate: string;
    unit_rate?: string;
}[]) {
    if (!expenseCommand(command) || lines.length < 1 || lines.length > 50 || lines.some(line => !line.description.trim())) {
        fail('INVALID_EXPENSE_BILL');
    }
    if (String(billTotal(lines.map(line => ({ item: '', warehouse: '', to: null, quantity: line.quantity, rate: line.rate, unit_rate: line.unit_rate })))) !== command.amount) {
        fail('INVALID_EXPENSE_TOTAL');
    }
    await demoRequest('expense-post', command);
    expenseBillLines[command.id] = structuredClone(lines);
}
export function demoPreviousBalance(company: string, partyId: string, date: string, kind: 'sale' | 'purchase' | 'expense') {
    const p = parties.find(p => p.id === partyId && p.company === company);
    if (!p) {
        return '0';
    }
    const balances = report(company, '0001-01-01', date, partyId, 0).ledger_balances;
    if (kind === 'sale') {
        return balances.receivable?.closing ?? '0';
    }
    if (kind === 'purchase') {
        return String(-BigInt(balances.payable?.closing ?? '0'));
    }
    const unpaid = expenseReport(company, '0001-01-01', date, 0).bills.filter(b => b.payee === p.name).reduce((sum, b) => sum + BigInt(b.due), 0n);
    return String(unpaid - (p.opening_side === 'advance' && p.opening_date <= date ? BigInt(p.opening_amount) : 0n));
}
export function nextDemoBillNumber(company: string, kind: 'sale' | 'purchase' | 'expense') {
    const prefix = { sale: 'S', purchase: 'P', expense: 'E' }[kind];
    const refs = kind === 'expense' ? expenses.filter(e => e.company === company && e.kind === 'charge').map(e => e.reference) : documents.filter(d => d.company === company && d.kind === kind).map(d => d.reference);
    const last = refs.reduce((max, ref) => { const number = ref.startsWith(prefix + '-') ? ref.slice(2) : ''; return /^\d{1,8}$/u.test(number) ? Math.max(max, Number(number)) : max; }, 0);
    return `${prefix}-${String(last + 1).padStart(4, '0')}`;
}
export function demoCompanyName(company: string) { return companies.find(c => c.id === company)?.name ?? ''; }
export function demoMasters(company: string) { return { items: structuredClone(items.filter(i => i.company === company)), parties: structuredClone(parties.filter(p => p.company === company)) }; }
function validText(value: string, max: number) { return value.length <= max && !/[<>]/u.test(value) && Array.from(value).every(char => (char.codePointAt(0) ?? 0) >= 32); }
export function saveDemoItem(value: DemoItem) {
    if (!value.name.trim() || !value.unit.trim() || !validText(value.name, 120) || !validText(value.code, 40) || !validText(value.unit, 24)) {
        fail('ITEM_FIELDS_REQUIRED');
    }
    if (value.default_rate !== null && !/^(0|[1-9]\d{0,11})$/u.test(value.default_rate)) {
        fail('INVALID_RATE');
    }
    if (value.code && items.some(i => i.id !== value.id && i.company === value.company && i.code.toLowerCase() === value.code.toLowerCase())) {
        fail('DUPLICATE_CODE');
    }
    const old = items.find(i => i.id === value.id && i.company === value.company);
    if (old && old.unit !== value.unit && documents.some(d => d.lines.some(l => l.item === old.id))) {
        fail('UNIT_ALREADY_USED');
    }
    if (old) {
        Object.assign(old, structuredClone(value));
    }
    else {
        items.push(structuredClone(value));
    }
}
function openingAccount(p: DemoParty): DemoParty['opening_account'] {
    if (p.kind === 'both') {
        return p.opening_account;
    }
    const accounts: Record<string, DemoParty['opening_account']> = { customer: 'receivable', expense: 'expense_payable' };
    return accounts[p.kind] ?? 'payable';
}
function validEmail(value: string) {
    const parts = value.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1] || /\s/u.test(value)) {
        return false;
    }
    return parts[1].slice(1, -1).includes('.');
}
function validatePartyContact(value: DemoParty) {
    if (!value.name.trim() || !validText(value.name, 120) || !validText(value.phone, 30) || !validText(value.email, 120) || !validText(value.address, 400) || !['customer', 'supplier', 'both', 'expense'].includes(value.kind)) {
        fail('PARTY_FIELDS_REQUIRED');
    }
    if (!/^(0|[1-9]\d{0,11})$/u.test(value.opening_amount) || !['none', 'due', 'advance'].includes(value.opening_side)) {
        fail('INVALID_OPENING');
    }
    if (value.phone && !/^[+\d ()-]{6,30}$/u.test(value.phone)) {
        fail('INVALID_PHONE');
    }
    if (value.email && !validEmail(value.email)) {
        fail('INVALID_EMAIL');
    }
    if (value.credit_limit !== null && !/^(0|[1-9]\d{0,11})$/u.test(value.credit_limit)) {
        fail('INVALID_CREDIT');
    }
    if (value.credit_days !== null && (!Number.isInteger(value.credit_days) || value.credit_days < 0 || value.credit_days > 3650)) {
        fail('INVALID_CREDIT');
    }
}
function validatePartyOpening(value: DemoParty) {
    if (value.opening_side === 'none' && BigInt(value.opening_amount) !== 0n) {
        fail('INVALID_OPENING');
    }
    if (BigInt(value.opening_amount) > 0n && (!/^\d{4}-\d{2}-\d{2}$/u.test(value.opening_date) || Number.isNaN(Date.parse(value.opening_date + 'T00:00:00Z')) || new Date(value.opening_date + 'T00:00:00Z').toISOString().slice(0, 10) !== value.opening_date)) {
        fail('OPENING_DATE_REQUIRED');
    }
}
export function saveDemoParty(value: DemoParty) {
    value = { ...value, opening_account: openingAccount(value) };
    if (!['receivable', 'payable', 'expense_payable'].includes(value.opening_account)) {
        fail('INVALID_OPENING');
    }
    validatePartyContact(value);
    validatePartyOpening(value);
    const old = parties.find(p => p.id === value.id && p.company === value.company);
    if (old) {
        const used = entries.some(e => e.party_id === old.id) || expenses.some(e => e.company === old.company && e.payee === old.name);
        if (used && ['kind', 'opening_account', 'opening_amount', 'opening_side', 'opening_date'].some(key => old[key as keyof DemoParty] !== value[key as keyof DemoParty])) {
            fail('OPENING_ALREADY_USED');
        }
        editDemoParty(old.id, value.name);
        Object.assign(old, structuredClone(value));
    }
    else {
        parties.push(structuredClone(value));
    }
}
export function editDemoParty(id: string, name: string) {
    const party = parties.find(p => p.id === id);
    if (!party || !name.trim() || name.length > 120 || /[<>]/u.test(name)) {
        fail('PARTY_FIELDS_REQUIRED');
    }
    const previous = party.name;
    party.name = name.trim();
    for (const entry of entries) {
        if (entry.party_id === id) {
            entry.party_name = party.name;
        }
    }
    for (const expense of expenses) {
        if (expense.company === party.company && party.kind === 'expense' && expense.payee === previous) {
            expense.payee = party.name;
        }
    }
    for (const doc of documents) {
        if (doc.party === id) {
            doc.party_name = party.name;
        }
    }
}
export function editDemoItem(id: string, values: {
    name: string;
    code: string;
    unit: string;
}) {
    const item = items.find(i => i.id === id);
    if (!item) {
        fail('ITEM_NOT_FOUND');
    }
    if (!values.name.trim() || !values.code.trim() || !values.unit.trim() || values.name.length > 120 || values.code.length > 40 || values.unit.length > 24 || Object.values(values).some(value => /[<>]/u.test(value))) {
        fail('ITEM_FIELDS_REQUIRED');
    }
    if (items.some(i => i.id !== id && i.company === item.company && i.code.toLowerCase() === values.code.toLowerCase())) {
        fail('DUPLICATE_CODE');
    }
    if (documents.some(d => d.lines.some(l => l.item === id)) && values.unit !== item.unit) {
        fail('UNIT_ALREADY_USED');
    }
    Object.assign(item, values);
}
export function demoRequest<T>(operation: string, value: unknown): Promise<T> {
    try {
        return Promise.resolve(dispatchDemoRequest<T>(operation, value));
    }
    catch (error) {
        return Promise.reject(error);
    }
}
function validateExpensePayment(command: ExpenseCommand) {
    const parent = expenses.find(e => e.id === command.parent && e.company === command.company && e.kind === 'charge' && !e.method && !expenses.some(r => r.company === command.company && r.kind === 'reversal' && r.parent === e.id));
    const paid = expenses.filter(e => e.company === command.company && e.parent === command.parent && e.kind === 'payment' && !expenses.some(r => r.company === command.company && r.kind === 'reversal' && r.parent === e.id)).reduce((n, e) => n + BigInt(e.amount), 0n);
    const opening = parties.find(p => p.id === command.parent && p.company === command.company && p.kind === 'expense' && p.opening_side === 'due');
    if ((!parent && !opening) || paid + BigInt(command.amount) > BigInt(parent?.amount ?? opening?.opening_amount ?? '0')) {
        fail('PAYMENT_EXCEEDS_DUE');
    }
    if (command.date < (parent?.date ?? opening?.opening_date ?? '') || command.payee !== (parent?.payee ?? opening?.name) || command.category !== (parent?.category ?? opening?.name)) {
        fail('INVALID_PAYMENT_LINK');
    }
}
function validateExpenseReversal(command: ExpenseCommand) {
    const original = expenses.find(e => e.id === command.parent && e.company === command.company && e.kind !== 'reversal');
    if (original?.amount !== command.amount || command.date < original.date || expenses.some(e => e.company === command.company && e.kind === 'reversal' && e.parent === original.id)) {
        fail('INVALID_REVERSAL');
    }
    if (original.kind === 'charge' && expenses.some(e => e.company === command.company && e.parent === original.id && e.kind === 'payment' && !expenses.some(r => r.kind === 'reversal' && r.parent === e.id))) {
        fail('REVERSE_PAYMENTS_FIRST');
    }
}
function postDemoExpense(value: unknown) {
    const command = expenseCommand(value);
    if (!command) {
        fail('INVALID_EXPENSE_COMMAND');
    }
    if (expenses.some(e => e.id === command.id)) {
        return;
    }
    if (command.kind === 'payment') {
        validateExpensePayment(command);
    }
    if (command.kind === 'reversal') {
        validateExpenseReversal(command);
    }
    expenses.push(structuredClone(command));
}
function createInventoryMaster(command: InventoryCommand, company: string) {
    if (command.kind === 'item') {
        if (items.some(i => i.company === company && i.code.toLowerCase() === command.code.toLowerCase())) {
            fail('DUPLICATE_CODE');
        }
        items.push({ id: command.id, company, code: command.code, name: command.name, unit: command.unit, default_rate: null });
        return true;
    }
    if (command.kind === 'warehouse') {
        warehouses.push({ id: command.id, company, code: command.code, name: command.name });
        return true;
    }
    return false;
}
function validateInventoryTrade(command: InventoryCommand, company: string) {
    if (command.kind !== 'purchase' && command.kind !== 'sale') {
        return;
    }
    const party = parties.find(p => p.id === command.party && p.company === company);
    const wanted = command.kind === 'sale' ? 'customer' : 'supplier';
    if (!party || !(party.kind === 'both' || party.kind === wanted)) {
        fail('PARTY_NOT_ACCESSIBLE');
    }
    if (command.lines.some(line => lineTotal(line) <= 0n)) {
        fail('INVALID_AMOUNT');
    }
}
function validateInventoryLines(command: InventoryCommand, company: string) {
    const projected = { ...command, lines: command.lines.map(({ unit_rate, ...line }) => ({ ...line, rate: unit_rate === undefined ? line.rate : String((1000000n + BigInt(line.quantity) - 1n) / BigInt(line.quantity)) })) };
    if (!inventoryCommand(projected) || billTotal(command.lines) > 999999999999n) {
        fail('INVALID_INVENTORY_COMMAND');
    }
    if (command.lines.some(line => !items.some(i => i.id === line.item && i.company === company) || !warehouses.some(w => w.id === line.warehouse && w.company === company) || (line.to && !warehouses.some(w => w.id === line.to && w.company === company)))) {
        fail('INVENTORY_NOT_ACCESSIBLE');
    }
}
function postDemoInventory(command: InventoryCommand, company: string) {
    if (documents.some(d => d.id === command.id) || items.some(i => i.id === command.id) || warehouses.some(w => w.id === command.id)) {
        return;
    }
    if (createInventoryMaster(command, company)) {
        return;
    }
    validateInventoryLines(command, company);
    validateInventoryTrade(command, company);
    if (command.kind === 'purchase' || command.kind === 'sale') {
        postTrade({ id: command.id, company, party: command.party!, kind: command.kind, date: command.date, amount: String(billTotal(command.lines) + BigInt(command.roundoff ?? '0')), method: 'cash', reference: command.reference, note: command.note, reverses: null });
    }
    documents.push({ ...structuredClone(command), total: String(billTotal(command.lines) + BigInt(command.roundoff ?? '0')), reversed: false, party_name: parties.find(p => p.id === command.party)?.name ?? null });
}
function dispatchDemoRequest<T>(operation: string, value: unknown): T {
    const p = value as Record<string, unknown>, company = textValue(p.company), from = textValue(p.from), to = textValue(p.to), offset = Number(p.offset ?? 0);
    let result: unknown = null;
    switch (operation) {
        case 'workspace':
            result = demoWorkspace(p);
            break;
        case 'retired-companies':
            result = companies.filter(c => retired[c.id]).map(c => ({ ...c, deleted_at: retired[c.id], purge_after: new Date(new Date(retired[c.id]).getTime() + 30 * 86400000).toISOString() }));
            break;
        case 'companies':
            result = companies.filter(c => !retired[c.id]);
            break;
        case 'create': {
            const row = p.row as Record<string, string>;
            if (p.table === 'khata_companies') {
                if (!companies.some(c => c.id === row.id)) {
                    companies.push({ id: row.id, name: row.name });
                    warehouses.push({ id: crypto.randomUUID(), company: row.id, code: 'MAIN', name: 'Main godown' });
                }
            }
            else if (!parties.some(c => c.id === row.id)) {
                parties.push({ id: row.id, name: row.name, kind: row.kind as Report['parties'][number]['kind'], company: row.company_id, receivable: '0', payable: '0', ...emptyPartyDetails });
            }
            result = { id: row.id, name: row.name };
            break;
        }
        case 'report':
            result = report(company, from, to, p.party as string | null, offset);
            break;
        case 'expense-report':
            result = expenseReport(company, from, to, offset);
            break;
        case 'inventory-report':
            result = inventory(company, from, to, offset);
            break;
        case 'expense-post':
            postDemoExpense(value);
            break;
        case 'inventory-post':
            postDemoInventory(value as InventoryCommand, company);
            break;
        case 'post':
            postTrade(value as Command);
            break;
        default: fail('DEMO_OPERATION_UNSUPPORTED');
    }
    return structuredClone(result) as T;
}
function postTrade(command: Command) {
    if (!pendingCommand(command)) {
        fail('INVALID_COMMAND');
    }
    if (entries.some(e => e.id === command.id)) {
        return;
    }
    const party = parties.find(p => p.id === command.party && p.company === command.company);
    if (!party || party.kind === 'expense') {
        fail('PARTY_NOT_ACCESSIBLE');
    }
    const accounts = { sale: ['receivable', 'sales'], purchase: ['purchases', 'payable'], receipt: [command.method, 'receivable'], payment: ['payable', command.method] } as const;
    let pair: readonly [
        Voucher['debit_account'],
        Voucher['credit_account']
    ];
    if (command.kind === 'reversal') {
        const old = entries.find(e => e.id === command.reverses && e.company === command.company);
        if (!old || old.reversed || old.party_id !== command.party || old.amount_minor !== command.amount || command.date < old.effective_date || !command.note.trim()) {
            fail('INVALID_REVERSAL');
        }
        const doc = documents.find(d => d.id === old.id);
        old.reversed = true;
        pair = [old.credit_account, old.debit_account];
        if (doc) {
            doc.reversed = true;
            inventoryReversals.set(doc.id, command.date);
        }
    }
    else {
        pair = accounts[command.kind];
    }
    entries.push({ id: command.id, company: command.company, party_id: command.party, party_name: party.name, kind: command.kind, effective_date: command.date, amount_minor: command.amount, debit_account: pair[0], credit_account: pair[1], reference: command.reference, note: command.note, reversed: false });
}
export function deleteDemoParty(company: string, id: string) {
    const p = parties.find(p => p.id === id && p.company === company);
    if (!p) {
        fail('PARTY_NOT_ACCESSIBLE');
    }
    if (BigInt(p.opening_amount) > 0n || entries.some(e => e.company === company && e.party_id === id) || expenses.some(e => e.company === company && e.payee === p.name) || documents.some(d => d.company === company && d.party === id)) {
        fail('PARTY_IN_USE');
    }
    parties = parties.filter(p => !(p.id === id && p.company === company));
}
export function deleteDemoItem(company: string, id: string) {
    if (!items.some(i => i.id === id && i.company === company)) {
        fail('ITEM_NOT_ACCESSIBLE');
    }
    if (documents.some(d => d.company === company && d.lines.some(l => l.item === id))) {
        fail('ITEM_IN_USE');
    }
    items = items.filter(i => !(i.id === id && i.company === company));
}
function demoAccountBalances(company: string, settings: WorkspaceSettings) {
    return settings.accounts.map(account => ({ ...account, entry_ids: entries.filter(e => e.company === company && (e.debit_account === account.kind || e.credit_account === account.kind) && (paymentLinks[e.id]?.account ?? account.kind) === account.id).map(e => e.id), balance: String(entries.filter(e => e.company === company && (e.debit_account === account.kind || e.credit_account === account.kind) && (paymentLinks[e.id]?.account ?? account.kind) === account.id).reduce((sum, e) => sum + BigInt(e.amount_minor) * (e.debit_account === account.kind ? 1n : -1n), 0n)) }));
}
function demoRecordDetail(company: string, id: unknown) {
    return { voucher: entries.find(e => e.id === id && e.company === company), bill: documents.find(d => d.id === id && d.company === company), expense: expenses.find(e => e.id === id && e.company === company), payments: entries.filter(e => paymentLinks[e.id]?.bill === id && !e.reversed), lines: expenseBillLines[String(id)], company_name: companies.find(c => c.id === company)?.name, item_names: Object.fromEntries(items.filter(i => i.company === company).map(i => [i.id, i.name])), account: paymentLinks[String(id)]?.account };
}
function demoBill(p: Record<string, unknown>, company: string, account: WorkspaceSettings['accounts'][number]) {
    const bill = { ...(p.bill as InventoryCommand), roundoff: String(p.roundoff) };
    const total = billTotal(bill.lines) + BigInt(bill.roundoff), paid = BigInt(String(p.paid));
    if (paid > total || paid < 0n) {
        fail('SETTLEMENT_EXCEEDS_BILL');
    }
    postDemoInventory(bill, company);
    if (paid > 0n) {
        const pid = crypto.randomUUID();
        postTrade({ id: pid, company, party: bill.party!, kind: bill.kind === 'sale' ? 'receipt' : 'payment', date: bill.date, amount: String(paid), method: account.kind, reference: bill.reference, note: 'Payment with bill', reverses: null });
        paymentLinks[pid] = { bill: bill.id, account: account.id };
    }
    return { id: bill.id, total: String(total), paid: String(paid), due: String(total - paid) };
}
function demoSettlement(p: Record<string, unknown>, company: string, settings: WorkspaceSettings, id: string) {
    const account = settings.accounts.find(row => row.id === p.account && row.active);
    if (!account) {
        fail('PAYMENT_ACCOUNT_REQUIRED');
    }
    if (p.action === 'bill') {
        return demoBill(p, company, account);
    }
    postTrade({ id, company, party: String(p.party), kind: p.kind as 'payment' | 'receipt', date: String(p.date), amount: String(p.amount), method: account.kind, reference: String(p.reference), note: String(p.note), reverses: null });
    paymentLinks[id] = { bill: null, account: account.id };
    return { id };
}
function demoExpenseCorrection(p: Record<string, unknown>, company: string) {
    const original = expenses.find(e => e.id === p.target && e.company === company);
    if (!original || original.kind === 'reversal' || expenses.some(e => e.kind === 'reversal' && e.parent === original.id)) {
        fail('RECORD_ALREADY_CORRECTED');
    }
    for (const payment of expenses.filter(e => e.company === company && e.parent === original.id && e.kind === 'payment' && !expenses.some(r => r.kind === 'reversal' && r.parent === e.id))) {
        postDemoExpense({ ...payment, id: crypto.randomUUID(), kind: 'reversal', method: null, parent: payment.id, note: String(p.reason) });
    }
    postDemoExpense({ ...original, id: crypto.randomUUID(), kind: 'reversal', method: null, parent: original.id, note: String(p.reason) });
    if (p.replacement) {
        demoWorkspace(p.replacement as Record<string, unknown>);
    }
    return { ok: true };
}
function demoCorrection(p: Record<string, unknown>, company: string) {
    if (p.type === 'expense') {
        return demoExpenseCorrection(p, company);
    }
    const target = entries.find(e => e.id === p.target && e.company === company);
    if (!target || target.reversed || target.kind === 'reversal') {
        fail('RECORD_ALREADY_CORRECTED');
    }
    const originals = [...entries.filter(e => paymentLinks[e.id]?.bill === target.id && !e.reversed), target];
    for (const row of originals) {
        const rid = crypto.randomUUID();
        postTrade({ id: rid, company, party: row.party_id, kind: 'reversal', date: row.effective_date, amount: row.amount_minor, method: 'cash', reference: '', note: String(p.reason), reverses: row.id });
        if (paymentLinks[row.id]) {
            paymentLinks[rid] = { ...paymentLinks[row.id] };
        }
    }
    if (p.replacement) {
        demoWorkspace(p.replacement as Record<string, unknown>);
    }
    return { ok: true };
}
function demoWorkspaceMutation(p: Record<string, unknown>, company: string, settings: WorkspaceSettings, id: string) {
    if (p.action === 'number') {
        const kind = p.kind as keyof WorkspaceSettings['next'];
        const result = settings.numbering[kind] + settings.next[kind];
        settings.next[kind] = String(BigInt(settings.next[kind]) + 1n);
        return result;
    }
    if (p.action === 'bill' || p.action === 'payment') {
        return demoSettlement(p, company, settings, id);
    }
    if (p.action === 'expense') {
        const command = p.command as ExpenseCommand;
        const lines = p.lines as NonNullable<import('./../accounting/expense-model').ExpenseEntry['bill_lines']>;
        if (lines.length && String(billTotal(lines.map(l => ({ ...l, item: '', warehouse: '', to: null })))) !== command.amount) {
            fail('INVALID_EXPENSE_TOTAL');
        }
        postDemoExpense(command);
        if (lines.length) {
            expenseBillLines[command.id] = structuredClone(lines);
        }
        return { id: command.id };
    }
    if (p.action === 'correct') {
        return demoCorrection(p, company);
    }
    fail('DEMO_OPERATION_UNSUPPORTED');
}
function demoWorkspace(p: Record<string, unknown>): unknown {
    const company = String(p.company), action = p.action;
    if (!companies.some(c => c.id === company)) {
        fail('COMPANY_NOT_ACCESSIBLE');
    }
    const settings = workspaceSettings[company] ??= defaultSettings();
    if (action === 'settings') {
        return settings;
    }
    if (action === 'settings-save') {
        workspaceSettings[company] = structuredClone(p.settings as WorkspaceSettings);
        return p.settings;
    }
    if (action === 'retire' || action === 'restore') {
        if (!companies.some(c => c.id === company && c.name === p.name)) {
            fail('COMPANY_NOT_ACCESSIBLE');
        }
        if (action === 'retire') {
            retired[company] ??= new Date().toISOString();
        }
        else {
            delete retired[company];
        }
        return { ok: true };
    }
    if (action === 'accounts') {
        return demoAccountBalances(company, settings);
    }
    if (action === 'detail') {
        return demoRecordDetail(company, p.id);
    }
    return demoWorkspaceTransaction(p, company, settings);
}
function demoWorkspaceTransaction(p: Record<string, unknown>, company: string, settings: WorkspaceSettings) {
    const id = String(p.action === 'bill' ? (p.bill as InventoryCommand).id : p.id), key = p.action === 'number' ? 'number:' + id : id, payload = JSON.stringify(p), existing = workspaceEvents[key];
    if (existing) {
        if (existing.payload !== payload) {
            fail('IDEMPOTENCY_CONFLICT');
        }
        return existing.result;
    }
    const before = structuredClone({ entries, documents, expenses, paymentLinks, workspaceEvents, reversals: [...inventoryReversals] });
    try {
        const result = demoWorkspaceMutation(p, company, settings, id);
        workspaceEvents[key] = { payload, result };
        return result;
    }
    catch (error) {
        entries = before.entries;
        documents = before.documents;
        expenses = before.expenses;
        paymentLinks = before.paymentLinks;
        workspaceEvents = before.workspaceEvents;
        inventoryReversals.clear();
        for (const [key, value] of before.reversals) {
            inventoryReversals.set(key, value);
        }
        throw error;
    }
}
