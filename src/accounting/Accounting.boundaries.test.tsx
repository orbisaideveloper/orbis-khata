import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Accounting } from './Accounting';
import type { Report } from './model';
const api = vi.hoisted(() => ({ requestKhata: vi.fn().mockResolvedValue(null), expenseReport: vi.fn(), postExpense: vi.fn(), companies: vi.fn(), report: vi.fn(), createRecord: vi.fn(), post: vi.fn(), rejected: vi.fn() }));
vi.mock('./api', () => api);
const empty: Report = { balances: { cash: { opening: '0', closing: '-100', movement: '-100' } }, ledger_balances: {}, parties: [], entries: [], count: 0, as_of: '' };
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.resetAllMocks(); api.requestKhata.mockResolvedValue(null); api.expenseReport.mockResolvedValue({ balances: {}, categories: [], bills: [], entries: [], count: 0 }); sessionStorage.clear(); api.companies.mockResolvedValue([{ id: 'c', name: 'Shop' }]); api.report.mockResolvedValue(empty); api.post.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function prepareReceipt() {
    api.report.mockResolvedValue({ ...empty, parties: [{ id: 'p', name: 'Party', kind: 'customer', receivable: '0', payable: '0' }] });
    render(<Accounting userId="u" language="en"/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Receive money' }));
    const form = screen.getByLabelText('Amount (INR)').closest('form')!;
    const controls = within(form);
    fireEvent.change(controls.getByLabelText('Party'), { target: { value: 'p' } });
    fireEvent.change(controls.getByLabelText('Amount (INR)'), { target: { value: '1' } });
    return form;
}
it('does not post a review whose date control is missing', async () => {
    const form = await prepareReceipt();
    within(form).getByLabelText('Date').remove();
    fireEvent.submit(form);
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
});
it.each([true, false])('ignores a company load completed after unmount (success=%s)', async (success) => {
    const pending = deferred<unknown>();
    api.companies.mockReturnValue(pending.promise);
    const view = render(<Accounting userId="u" language="en"/>);
    view.unmount();
    await act(async () => {
        if (success) {
            pending.resolve([{ id: 'c', name: 'Shop' }]);
        }
        else {
            pending.reject(new Error('offline'));
        }
    });
    expect(api.report).not.toHaveBeenCalled();
});
it('renders empty parties, ledger, negative cash and journal mismatch without fabricated entries', async () => {
    render(<Accounting userId="u" language="en"/>);
    await screen.findByText('ORBIS / Shop');
    expect(await screen.findByText('⚠ Journal mismatch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sale' }));
    expect(screen.getByRole('button', { name: 'Review entry' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Custom'}));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
    expect(await screen.findByText(/valid date range/, { selector: 'output' })).toBeVisible();
});
it('ignores a late report error from a previously selected company', async () => {
    api.companies.mockResolvedValue([{ id: 'c', name: 'Shop' }, { id: 'other', name: 'Other' }]);
    const pending = deferred<Report>();
    api.report.mockReturnValueOnce(pending.promise).mockResolvedValue(empty);
    render(<Accounting userId="u" language="en"/>);
    await screen.findByLabelText('Company');
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'other' } });
    await screen.findByText('ORBIS / Other');
    await act(async () => pending.reject(new Error('old offline')));
    expect(screen.queryByText('Could not load the books. Check your connection and retry.')).toBeNull();
});
it('creates an initial company once and exposes its real returned identity', async () => {
    api.companies.mockResolvedValue([]);
    const pending = deferred<{
        id: string;
        name: string;
    }>();
    api.createRecord.mockReturnValue(pending.promise);
    render(<Accounting userId="u" language="en"/>);
    const name = await screen.findByLabelText('Company name');
    fireEvent.change(name, { target: { value: ' New Shop ' } });
    const form = name.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.createRecord).toHaveBeenCalledOnce();
    await act(async () => pending.resolve({ id: 'created', name: 'New Shop' }));
    expect(await screen.findByText('ORBIS / New Shop')).toBeInTheDocument();
    expect(screen.getByLabelText('Company')).toHaveValue('created');
});
it('does not offer reversing a reversed voucher or a reversal voucher', async () => {
    const row = { id: 'v', party_id: 'p', party_name: 'Party', kind: 'sale' as const, effective_date: '2026-01-01', amount_minor: '100', debit_account: 'receivable' as const, credit_account: 'sales' as const, reference: '', note: '', reversed: true };
    api.report.mockResolvedValue({ ...empty, entries: [row, { ...row, id: 'r', reversed: false, kind: 'reversal' }], count: 2 });
    render(<Accounting userId="u" language="en"/>);
    await waitFor(() => expect(api.report).toHaveBeenCalled());
    await screen.findByText(/Journal mismatch/);
    expect(document.querySelectorAll('.books-entry')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Reverse' })).toBeNull();
});
it('uses the voucher party identity when its display row is unavailable during retry', async () => {
    sessionStorage.setItem('khata-pending-v1:u', JSON.stringify({ id: 'v', company: 'c', party: 'unknown-party', kind: 'receipt', date: '2026-01-01', amount: '100', method: 'cash', reference: '', note: '', reverses: null }));
    render(<Accounting userId="u" language="en"/>);
    await screen.findByText('unknown-party');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Saved successfully.');
    expect(api.post).toHaveBeenCalledOnce();
});
it('handles absent form fields without making up a record name or party kind', async () => {
    api.createRecord.mockResolvedValue({ id: 'created', name: 'Created' });
    render(<Accounting userId="u" language="en"/>);
    fireEvent.click(await screen.findByRole('button', { name: /New company/ }));
    let form = screen.getByLabelText('Company name').closest('form')!;
    screen.getByLabelText('Company name').remove();
    fireEvent.submit(form);
    await waitFor(() => expect(api.createRecord).toHaveBeenCalledOnce());
    expect(api.createRecord.mock.calls[0][1].name).toBe('');
    await screen.findByText('ORBIS / Created');
    fireEvent.click(await screen.findByRole('button', { name: 'Parties' }));
    fireEvent.click(await screen.findByRole('button', { name: /Add party/ }));
    form = screen.getByLabelText('Party name').closest('form')!;
    screen.getByLabelText('Party name').remove();
    screen.getByLabelText('Type').remove();
    fireEvent.submit(form);
    await waitFor(() => expect(api.createRecord).toHaveBeenCalledTimes(2));
    expect(api.createRecord.mock.calls[1][1]).toMatchObject({ name: '', kind: '' });
});
it('keeps an entry under review when a duplicate confirmation is dispatched', async () => {
    const pending = deferred<void>();
    api.post.mockReturnValue(pending.promise);
    const form = await prepareReceipt();
    fireEvent.submit(form);
    const confirm = screen.getByRole('button', { name: 'Confirm & save' });
    act(() => { confirm.click(); confirm.click(); });
    expect(api.post).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(undefined));
    await screen.findByText('Saved successfully.');
});
