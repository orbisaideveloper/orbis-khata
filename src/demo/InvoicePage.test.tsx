import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InvoicePage } from './InvoicePage';
import { demoMasters, demoRequest, resetDemo, saveDemoItem, saveDemoParty } from './store';
import { emptyPartyDetails, type DemoParty } from './master-model';
import type { InventoryReport } from '../inventory/model';
import type { ExpenseReport } from '../accounting/expense-model';
const company = '11111111-1111-4111-8111-111111111111', warehouse = '22222222-2222-4222-8222-222222222222';
let supplier: DemoParty;
beforeEach(() => { resetDemo(); vi.spyOn(window, 'confirm').mockReturnValue(true); vi.spyOn(window, 'scrollTo').mockImplementation(() => { }); supplier = { id: crypto.randomUUID(), company, name: 'Gopal Dairy', kind: 'supplier', receivable: '0', payable: '0', ...emptyPartyDetails, phone: '9876543210', address: 'Krishnanagar' }; saveDemoParty(supplier); saveDemoItem({ id: crypto.randomUUID(), company, name: 'Milk', code: '', unit: 'litre', default_rate: '6000' }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function mount(kind: 'purchase' | 'sale' | 'expense' = 'purchase') {
    return render(<InvoicePage kind={kind} language="en" company={company} companyName="Demo shop" {...demoMasters(company)} warehouses={[{ id: warehouse, name: 'Main' }]} onSaved={() => { }} onBack={() => { }}/>);
}
function fill() {
    fireEvent.change(screen.getByLabelText('Party'), { target: { value: supplier.id } });
    fireEvent.change(screen.getByLabelText('Item name 1'), { target: { value: demoMasters(company).items[0].id } });
    fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '10' } });
}
it('shows a real bill table, party contact details and an editable default rate; posts only after confirmation', async () => {
    mount();
    fill();
    expect(screen.getByText('9876543210', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Krishnanagar')).toBeInTheDocument();
    for (const heading of ['No.', 'Item name', 'Quantity', 'Rate', 'Amount']) {
        expect(screen.getByRole('columnheader', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Rate 1')).toHaveValue('60.00');
    fireEvent.change(screen.getByLabelText('Rate 1'), { target: { value: '65' } });
    expect(screen.getByLabelText('Amount 1')).toHaveValue('650.00');
    expect(within(screen.getByRole('table')).getByText('₹650.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review bill' }));
    expect((await demoRequest<InventoryReport>('inventory-report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0 })).documents).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    await screen.findByText('Bill saved.');
    const inventory = await demoRequest<InventoryReport>('inventory-report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0 });
    expect(inventory.stocks[0].closing).toBe('10000000');
    expect(inventory.documents[0].total).toBe('65000');
});
it('accepts an item with no default rate and lets the user enter the rate in the bill', () => {
    const item = demoMasters(company).items[0];
    saveDemoItem({ ...item, default_rate: null });
    mount();
    fill();
    expect(screen.getByLabelText('Rate 1')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Rate 1'), { target: { value: '70' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review bill' }));
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeInTheDocument();
});
it('keeps expense bills out of inventory and records their exact total once', async () => {
    supplier = { ...supplier, kind: 'expense', name: 'Electricity' };
    saveDemoParty(supplier);
    mount('expense');
    fireEvent.change(screen.getByLabelText('Party'), { target: { value: supplier.id } });
    fireEvent.change(screen.getByLabelText('Description 1'), { target: { value: 'October electricity' } });
    fireEvent.change(screen.getByLabelText('Rate 1'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review bill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    await screen.findByText('Bill saved.');
    const range = { company, from: '2026-01-01', to: '2099-12-31', offset: 0 };
    expect((await demoRequest<InventoryReport>('inventory-report', range)).documents).toHaveLength(0);
    const expense = await demoRequest<ExpenseReport>('expense-report', range);
    expect(expense.bills[0].due).toBe('10000');
    expect(expense.entries[0].bill_lines?.[0]).toMatchObject({ description: 'October electricity', quantity: '1000000', rate: '10000' });
});
it('uses the selected company name and posts the exact amount entered even when rate repeats', async () => {
    mount();
    fill();
    expect(screen.getByRole('heading', { level: 1, name: 'Demo shop' })).toBeInTheDocument();
    expect(screen.queryByText('Maa Textile')).toBeNull();
    fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '100' } });
    expect(screen.getByLabelText('Rate 1')).toHaveValue('33.33');
    fireEvent.click(screen.getByRole('button', { name: 'Review bill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    await screen.findByText('Bill saved.');
    const inventory = await demoRequest<InventoryReport>('inventory-report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0 });
    expect(inventory.documents[0].total).toBe('10000');
    expect(inventory.documents[0].lines[0].unit_rate).toBe('33.33333333');
});
it('shows previous balance separately and never posts it again with the new bill', async () => {
    supplier = { ...supplier, opening_side: 'due', opening_amount: '50000', opening_date: '2026-10-01' };
    saveDemoParty(supplier);
    mount();
    fill();
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '100' } });
    expect(screen.getByText('₹500.00')).toBeInTheDocument();
    expect(screen.getByText('₹600.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review bill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    await screen.findByText('Bill saved.');
    expect((await demoRequest<InventoryReport>('inventory-report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0 })).documents[0].total).toBe('10000');
    expect(screen.getByText('₹600.00')).toBeInTheDocument();
});
it('adds and removes bill rows without losing the first row pricing', () => {
    mount();
    fill();
    fireEvent.click(screen.getByRole('button', { name: '＋ Add row' }));
    expect(screen.getByLabelText('Item name 2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Item name 2'), { target: { value: demoMasters(company).items[0].id } });
    fireEvent.change(screen.getByLabelText('Amount 2'), { target: { value: '120' } });
    expect(screen.getByLabelText('Rate 2')).toHaveValue('120.00');
    fireEvent.click(screen.getByRole('button', { name: 'Remove 2' }));
    expect(screen.queryByLabelText('Item name 2')).toBeNull();
    expect(screen.getByLabelText('Amount 1')).toHaveValue('600.00');
});
it('switches three printable designs without changing the bill or saving it', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => { });
    mount();
    fill();
    fireEvent.change(screen.getByLabelText('Company address / phone'), { target: { value: 'Krishnanagar · 12345' } });
    fireEvent.click(screen.getByLabelText('Office bill'));
    fireEvent.click(screen.getByRole('button', { name: 'Review bill' }));
    expect(screen.getByRole('article')).toHaveClass('bill-template-classic');
    expect(screen.getByText('Krishnanagar · 12345')).toBeInTheDocument();
    for (const [name, style] of [['Modern', 'modern'], ['Blue memo', 'sample']]) {
        fireEvent.click(screen.getByLabelText(name));
        expect(screen.getByRole('article')).toHaveClass('bill-template-' + style);
        expect(within(screen.getByRole('article')).getAllByText('₹600.00').length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Print / PDF' }));
    expect(print).toHaveBeenCalledOnce();
    expect((await demoRequest<InventoryReport>('inventory-report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0 })).documents).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Back to bill' }));
    expect(screen.getByLabelText('Amount 1')).toHaveValue('600.00');
    expect(screen.getByLabelText('Blue memo')).toBeChecked();
});
it('creates a supplier inside the bill, selects it, and posts to that party without losing entered lines', async () => {
    mount();
    fill();
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: '＋ Add party' }));
    expect(screen.getByLabelText('Category')).toHaveValue('supplier');
    expect(screen.getByLabelText('Category')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ajay Supplier' } });
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '9876501234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const created = demoMasters(company).parties.find(p => p.name === 'Ajay Supplier')!;
    expect(screen.getByLabelText('Party')).toHaveValue(created.id);
    expect(screen.getByLabelText('Amount 1')).toHaveValue('750');
    expect(screen.getByText('9876501234', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review bill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    await screen.findByText('Bill saved.');
    const report = await demoRequest<import('../accounting/model').Report>('report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0, party: null });
    expect(report.entries[0]).toMatchObject({ party_id: created.id, party_name: 'Ajay Supplier', amount_minor: '75000' });
});
it('shows only matching company and bill-role parties and keeps the draft when party creation is cancelled', () => {
    const other = { ...supplier, id: crypto.randomUUID(), company: 'other-company', name: 'Other tenant' };
    const customer = { ...supplier, id: crypto.randomUUID(), kind: 'customer' as const, name: 'Customer only' };
    render(<InvoicePage kind="purchase" language="en" company={company} companyName="Shop" items={demoMasters(company).items} parties={[supplier, other, customer]} warehouses={[{ id: warehouse, name: 'Main' }]} onSaved={() => { }} onBack={() => { }}/>);
    expect(screen.getByRole('option', { name: 'Gopal Dairy · Supplier' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Other tenant|Customer only/ })).toBeNull();
    fill();
    fireEvent.click(screen.getByRole('button', { name: '＋ Add party' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Party')).toHaveValue(supplier.id);
    expect(screen.getByLabelText('Amount 1')).toHaveValue('600.00');
});
it('lets an empty sales bill add a customer rather than leaving an unusable party dropdown', () => {
    mount('sale');
    expect(screen.getByRole('status')).toHaveTextContent('Customer');
    fireEvent.click(screen.getByRole('button', { name: '＋ Add party' }));
    expect(screen.getByLabelText('Category')).toHaveValue('customer');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('option', { name: 'New customer · Customer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Party')).toHaveValue(demoMasters(company).parties.find(p => p.name === 'New customer')!.id);
});
it('uses the loaded default godown when bill opens before the godown list arrives', () => {
    const props = { kind: 'purchase' as const, language: 'en' as const, company, companyName: 'Shop', ...demoMasters(company), onSaved: () => { }, onBack: () => { } };
    const view = render(<InvoicePage {...props} warehouses={[]}/>);
    fill();
    view.rerender(<InvoicePage {...props} warehouses={[{ id: warehouse, name: 'Main' }]}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Review bill' }));
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeInTheDocument();
});
it('saves a partial bank payment and round-off together with the purchase bill', async () => {
 mount(); fill(); fireEvent.change(screen.getByLabelText('Quantity 1'),{target:{value:'1'}});fireEvent.change(screen.getByLabelText('Rate 1'),{target:{value:'100.49'}});fireEvent.change(screen.getByLabelText('Paid now'),{target:{value:'40'}});fireEvent.change(screen.getByLabelText('Account'),{target:{value:'bank'}});fireEvent.click(screen.getByLabelText('Round to nearest rupee'));fireEvent.focus(screen.getByLabelText('Rate 1'));fireEvent.blur(screen.getByLabelText('Rate 1'));fireEvent.click(screen.getByRole('button',{name:'Review bill'}));fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText('Bill saved.');const r=await demoRequest<any>('report',{company,from:'2026-01-01',to:'2099-12-31',offset:0});expect(r.balances.bank.closing).toBe('-4000');expect(r.parties.find((p:any)=>p.id===supplier.id).payable).toBe('6000');
});
it('rejects overpayment before sending an invoice and preserves the editable draft',()=>{mount();fill();fireEvent.change(screen.getByLabelText('Paid now'),{target:{value:'999999'}});fireEvent.click(screen.getByRole('button',{name:'Review bill'}));expect(screen.getByRole('alert')).toHaveTextContent('Check party');expect(screen.getByLabelText('Paid now')).toHaveValue('999999');});
