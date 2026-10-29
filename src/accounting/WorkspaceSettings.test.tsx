import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceSettings, RetiredCompanies } from './WorkspaceSettings';
import { BookServicesContext, type BookServices } from '../books-services';
import { defaultSettings } from './workspace-contract';
const company = '11111111-1111-4111-8111-111111111111';
let request: ReturnType<typeof vi.fn>;
const changed = vi.fn();
beforeEach(() => {
    request = vi.fn(async (_op, p) => {
        if (p.action === 'settings') {
            return defaultSettings();
        }
        if (p.action === 'accounts') {
            return [{ id: 'cash', balance: '-100' }];
        }
        if (_op === 'retired-companies') {
            return [{ id: company, name: 'Shop', purge_after: '2026-11-28' }];
        }
        return { ok: true };
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('Shop');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function mount(language: 'en' | 'bn' | 'hi' = 'en') { render(<BookServicesContext.Provider value={{ request } as unknown as BookServices}><WorkspaceSettings company={company} name="Shop" language={language} onChanged={changed}/></BookServicesContext.Provider>); }
it('edits accounts, channels, activity and all numbering settings then saves them', async () => {
    mount();
    await screen.findByText('−₹1.00');
    fireEvent.change(screen.getAllByLabelText('Account name')[0], { target: { value: 'Till' } });
    fireEvent.change(screen.getAllByLabelText('Payment channel (optional)')[0], { target: { value: 'Cash desk' } });
    fireEvent.click(screen.getAllByLabelText('Active')[1]);
    fireEvent.click(screen.getByRole('button', { name: '＋ Add account' }));
    const names = screen.getAllByLabelText('Account name');
    fireEvent.change(names[2], { target: { value: 'Second bank' } });
    fireEvent.change(screen.getAllByLabelText('Type')[2], { target: { value: 'cash' } });
    fireEvent.change(screen.getAllByLabelText('Numbering mode')[0],{target:{value:'manual'}});
    expect(screen.queryByLabelText('Prefix')).not.toBeInTheDocument();
    for (const field of screen.getAllByLabelText('Next serial')) {
        fireEvent.change(field, { target: { value: '10' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Settings saved.');
    expect(request).toHaveBeenCalledWith('workspace', expect.objectContaining({ action: 'settings-save', settings: expect.objectContaining({ mode:{sale:'manual',purchase:'auto',expense:'auto'},next: { sale: '10', purchase: '10', expense: '10' } }) }));
});
it('blocks invalid settings and keeps server failures visible', async () => { mount(); await screen.findByText('−₹1.00'); fireEvent.change(screen.getAllByLabelText('Account name')[0], { target: { value: '' } }); fireEvent.click(screen.getByRole('button', { name: 'Save settings' })); await screen.findByText('Check names and numbering.'); fireEvent.change(screen.getAllByLabelText('Account name')[0], { target: { value: 'Cash' } }); const original = request.getMockImplementation() as (op: string, p: any) => Promise<unknown>; request.mockImplementation((op, p) => p.action === 'settings-save' ? Promise.reject(Error('offline')) : original(op, p)); fireEvent.click(screen.getByRole('button', { name: 'Save settings' })); expect(await screen.findByText('Not saved. Retry.')).toBeInTheDocument(); });
it('requires two confirmations and exact company name for retirement', async () => { mount(); await screen.findByText('−₹1.00'); fireEvent.click(screen.getByRole('button', { name: 'Delete company' })); await waitFor(() => expect(changed).toHaveBeenCalled()); expect(window.confirm).toHaveBeenCalledTimes(2); expect(request).toHaveBeenCalledWith('workspace', { company, action: 'retire', name: 'Shop' }); });
it('cancels retirement if the typed name differs', async () => { vi.mocked(window.prompt).mockReturnValue('Other'); mount(); await screen.findByText('−₹1.00'); fireEvent.click(screen.getByRole('button', { name: 'Delete company' })); expect(changed).not.toHaveBeenCalled(); });
it('shows load errors without enabling an overwrite of unavailable settings', async () => { request.mockRejectedValue(Error('offline')); mount(); await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled(); });
it('restores deleted companies through the owner-confirmed action', async () => { render(<BookServicesContext.Provider value={{ request } as unknown as BookServices}><RetiredCompanies language="en" onChanged={changed}/></BookServicesContext.Provider>); fireEvent.click(await screen.findByRole('button', { name: 'Restore' })); await waitFor(() => expect(changed).toHaveBeenCalled()); expect(request).toHaveBeenCalledWith('workspace', { company, action: 'restore', name: 'Shop' }); });
