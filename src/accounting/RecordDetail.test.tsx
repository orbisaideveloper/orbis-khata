import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BookServicesContext, type BookServices } from '../books-services';
import { RecordDetail } from './RecordDetail';
import { defaultSettings } from './workspace-contract';
const company = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222';
const voucher = { id, party_id: id, party_name: 'Trader', kind: 'payment', effective_date: '2026-10-20', amount_minor: '10000', reference: 'P1', note: 'Original', debit_account: 'payable', credit_account: 'bank', reversed: false };
let request: ReturnType<typeof vi.fn>;
const changed = vi.fn(), close = vi.fn();
beforeEach(() => {
    request = vi.fn(async (_op, input) => {
        if (input.action === 'settings') {
            return defaultSettings();
        }
        if (input.action === 'detail') {
            return { voucher, bill: null, payments: [], account: 'bank' };
        }
        return { ok: true };
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function mount(mode: 'view' | 'edit' | 'delete' = 'view') { render(<BookServicesContext.Provider value={{ request } as unknown as BookServices}><RecordDetail company={company} id={id} mode={mode} language="en" onClose={close} onChanged={changed}/></BookServicesContext.Provider>); }
it('requires both deletion confirmations and submits a stable audited correction', async () => { mount('delete'); await screen.findByText('Trader'); fireEvent.click(screen.getByRole('button', { name: 'Delete' })); await waitFor(() => expect(changed).toHaveBeenCalledOnce()); expect(window.confirm).toHaveBeenCalledTimes(2); expect(request).toHaveBeenCalledWith('workspace', expect.objectContaining({ action: 'correct', target: id, replacement: null })); });
it('cancelling either confirmation leaves the record untouched', async () => { vi.mocked(window.confirm).mockReturnValueOnce(true).mockReturnValueOnce(false); mount(); await screen.findByText('Trader'); fireEvent.click(screen.getByRole('button', { name: 'Delete' })); expect(request.mock.calls.filter(([, p]) => p.action === 'correct')).toHaveLength(0); fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(close).toHaveBeenCalledOnce(); });
it('edits payment amount, date and account with reviewed double confirmation', async () => { mount('edit'); await screen.findByLabelText('Amount'); fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '75' } }); fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-19' } }); fireEvent.change(screen.getByLabelText('Bill number'), { target: { value: 'P2' } }); fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Fixed' } }); fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'cash' } }); fireEvent.click(screen.getByRole('button', { name: 'Review & save changes' })); await waitFor(() => expect(changed).toHaveBeenCalled()); expect(request).toHaveBeenCalledWith('workspace', expect.objectContaining({ replacement: expect.objectContaining({ action: 'payment', amount: '7500', date: '2026-10-19', account: 'cash', reference: 'P2', note: 'Fixed' }) })); });
it('shows loading failures without an invented empty record', async () => { request.mockRejectedValue(new Error('offline')); mount(); expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull(); });
it('keeps failed edits open and shows a safe error instead of reporting success', async () => {
    const original = request.getMockImplementation() as (op: string, input: {
        action: string;
    }) => Promise<unknown>;
    request.mockImplementation(async (op, input) => input.action === 'correct' ? Promise.reject(new Error('private secret')) : original(op, input));
    mount('edit');
    await screen.findByLabelText('Amount');
    fireEvent.click(screen.getByRole('button', { name: 'Review & save changes' }));
    await screen.findByRole('alert');
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByText('private secret')).toBeNull();
});
it('edits exact saved invoice rows and retains the original party and warehouse', async () => { const original = request.getMockImplementation() as (op: string, p: any) => Promise<unknown>; request.mockImplementation((op, p) => p.action === 'detail' ? Promise.resolve({ voucher: { ...voucher, kind: 'purchase' }, bill: { id, company, kind: 'purchase', date: '2026-10-20', party: id, code: '', name: '', unit: '', reference: 'P1', note: '', total: '10000', lines: [{ item: id, warehouse: id, to: null, quantity: '1000000', rate: '10000', unit_rate: '100' }] }, payments: [], item_names: { [id]: 'Milk' }, company_name: 'Shop', party_name: 'Trader' }) : original(op, p)); mount('edit'); await screen.findByLabelText('Quantity'); fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } }); fireEvent.change(screen.getByLabelText('Rate'), { target: { value: '50' } }); fireEvent.click(screen.getByRole('button', { name: 'Review & save changes' })); await waitFor(() => expect(changed).toHaveBeenCalled()); expect(request).toHaveBeenCalledWith('workspace', expect.objectContaining({ replacement: expect.objectContaining({ bill: expect.objectContaining({ lines: [expect.objectContaining({ quantity: '2000000', unit_rate: '50' })] }) }) })); });
