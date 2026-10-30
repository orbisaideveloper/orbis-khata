import {defaultSettings} from '../accounting/workspace-contract';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
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
async function reviewBill(){await waitFor(()=>expect(screen.getByLabelText('Bill number')).not.toHaveValue(''));fireEvent.click(screen.getByRole('button',{name:'Review bill'}));}
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
    await reviewBill();
    expect((await demoRequest<InventoryReport>('inventory-report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0 })).documents).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    await screen.findByText('Bill saved.');
    const inventory = await demoRequest<InventoryReport>('inventory-report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0 });
    expect(inventory.stocks[0].closing).toBe('10000000');
    expect(inventory.documents[0].total).toBe('65000');
});
it('accepts an item with no default rate and lets the user enter the rate in the bill', async () => {
    const item = demoMasters(company).items[0];
    saveDemoItem({ ...item, default_rate: null });
    mount();
    fill();
    expect(screen.getByLabelText('Rate 1')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Rate 1'), { target: { value: '70' } });
    await reviewBill();
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeInTheDocument();
});
it('keeps expense bills out of inventory and records their exact total once', async () => {
    supplier = { ...supplier, kind: 'expense', name: 'Electricity' };
    saveDemoParty(supplier);
    mount('expense');
    fireEvent.change(screen.getByLabelText('Party'), { target: { value: supplier.id } });
    fireEvent.change(screen.getByLabelText('Description 1'), { target: { value: 'October electricity' } });
    fireEvent.change(screen.getByLabelText('Rate 1'), { target: { value: '100' } });
    await reviewBill();
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
    await reviewBill();
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
    await reviewBill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    await screen.findByText('Bill saved.');
    expect((await demoRequest<InventoryReport>('inventory-report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0 })).documents[0].total).toBe('10000');
    expect(screen.getByText('₹600.00')).toBeInTheDocument();
});
it('adds and removes bill rows without losing the first row pricing', async () => {
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
it('uses saved bill design and company details without showing settings in entry',async()=>{const settings=defaultSettings();settings.invoice={template:'modern',name:'My printed business',details:'Krishnanagar · 12345'};await demoRequest('workspace',{company,action:'settings-save',settings});supplier={...supplier,kind:'customer'};saveDemoParty(supplier);mount('sale');fill();expect(screen.queryByText('Bill settings')).not.toBeInTheDocument();expect(screen.queryByLabelText('Company address / phone')).not.toBeInTheDocument();await reviewBill();expect(screen.getByRole('article')).toHaveClass('bill-template-modern');expect(screen.getByText('My printed business')).toBeInTheDocument();expect(screen.getByText('Krishnanagar · 12345')).toBeInTheDocument();expect((await demoRequest<InventoryReport>('inventory-report',{company,from:'2026-01-01',to:'2099-12-31',offset:0})).documents).toHaveLength(0);});

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
    await reviewBill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & save' }));
    await screen.findByText('Bill saved.');
    const report = await demoRequest<import('../accounting/model').Report>('report', { company, from: '2026-01-01', to: '2099-12-31', offset: 0, party: null });
    expect(report.entries[0]).toMatchObject({ party_id: created.id, party_name: 'Ajay Supplier', amount_minor: '75000' });
});
it('shows only matching company and bill-role parties and keeps the draft when party creation is cancelled', async () => {
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
it('lets an empty sales bill add a customer rather than leaving an unusable party dropdown', async () => {
    mount('sale');
    expect(screen.getByRole('status')).toHaveTextContent('Customer');
    fireEvent.click(screen.getByRole('button', { name: '＋ Add party' }));
    expect(screen.getByLabelText('Category')).toHaveValue('customer');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('option', { name: 'New customer · Customer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Party')).toHaveValue(demoMasters(company).parties.find(p => p.name === 'New customer')!.id);
});
it('uses the loaded default godown when bill opens before the godown list arrives', async () => {
    const props = { kind: 'purchase' as const, language: 'en' as const, company, companyName: 'Shop', ...demoMasters(company), onSaved: () => { }, onBack: () => { } };
    const view = render(<InvoicePage {...props} warehouses={[]}/>);
    fill();
    view.rerender(<InvoicePage {...props} warehouses={[{ id: warehouse, name: 'Main' }]}/>);
    await reviewBill();
    expect(screen.getByRole('button', { name: 'Confirm & save' })).toBeInTheDocument();
});
it('saves a partial bank payment and discount together with the purchase bill', async () => {
 mount(); fill(); fireEvent.change(screen.getByLabelText('Quantity 1'),{target:{value:'1'}});fireEvent.change(screen.getByLabelText('Rate 1'),{target:{value:'100.49'}});fireEvent.change(screen.getByLabelText('Paid now'),{target:{value:'40'}});fireEvent.change(screen.getByLabelText('Account'),{target:{value:'bank'}});fireEvent.change(screen.getByLabelText('Less / discount'),{target:{value:'0.49'}});fireEvent.focus(screen.getByLabelText('Rate 1'));fireEvent.blur(screen.getByLabelText('Rate 1'));await reviewBill();fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText('Bill saved.');const r=await demoRequest<any>('report',{company,from:'2026-01-01',to:'2099-12-31',offset:0});expect(r.balances.bank.closing).toBe('-4000');expect(r.parties.find((p:any)=>p.id===supplier.id).payable).toBe('6000');
});
it('accepts payment above the bill total and shows the resulting advance',async()=>{mount();fill();fireEvent.change(screen.getByLabelText('Paid now'),{target:{value:'1000'}});await reviewBill();expect(screen.getByRole('button',{name:'Confirm & save'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText('Bill saved.');expect(screen.getByText(/Advance remaining/)).toBeInTheDocument();});

it('requires a manual reference when selected in settings and posts that exact number',async()=>{const settings=defaultSettings();settings.mode={sale:'auto',purchase:'manual',expense:'auto'};await demoRequest('workspace',{company,action:'settings-save',settings});mount();fill();await waitFor(()=>expect(screen.getByLabelText('Bill number')).not.toHaveAttribute('readonly'));fireEvent.change(screen.getByLabelText('Bill number'),{target:{value:'MY-105'}});fireEvent.click(screen.getByRole('button',{name:'Review bill'}));fireEvent.click(await screen.findByRole('button',{name:'Confirm & save'}));await screen.findByText('Bill saved.');const report=await demoRequest<InventoryReport>('inventory-report',{company,from:'2026-01-01',to:'2099-12-31',offset:0});expect(report.documents[0].reference).toBe('MY-105');});
it('places 1 then 2 into actual invoice fields and saves both references without changing bill totals',async()=>{mount();fill();await waitFor(()=>expect(screen.getByLabelText('Bill number')).toHaveValue('1'));await reviewBill();fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText('Bill saved.');cleanup();mount();fill();await waitFor(()=>expect(screen.getByLabelText('Bill number')).toHaveValue('2'));await reviewBill();fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText('Bill saved.');const report=await demoRequest<InventoryReport>('inventory-report',{company,from:'2026-01-01',to:'2099-12-31',offset:0});expect(report.documents.map(row=>row.reference).sort()).toEqual(['1','2']);expect(report.documents.map(row=>row.total)).toEqual(['60000','60000']);expect(report.stocks[0].closing).toBe('20000000');});
it('identifies the missing item and marks its field instead of a generic checklist',async()=>{mount();fireEvent.change(screen.getByLabelText('Party'),{target:{value:supplier.id}});await reviewBill();expect(screen.getByRole('alert')).toHaveTextContent('Row 1: choose an item.');expect(screen.getByLabelText('Item name 1')).toHaveAttribute('aria-invalid','true');});
it('identifies the exact invalid quantity without leaving the editable bill',async()=>{mount();fill();fireEvent.change(screen.getByLabelText('Quantity 1'),{target:{value:'bad'}});await reviewBill();expect(screen.getByRole('alert')).toHaveTextContent('Row 1: enter a valid quantity.');expect(screen.getByLabelText('Quantity 1')).toHaveAttribute('aria-invalid','true');});
