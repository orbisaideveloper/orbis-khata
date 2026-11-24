import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LotteryAccountingWorkspace } from '../../vendor/foundation-lottery/src/admin/dashboard/sections/LotteryAccountingWorkspace';
import type { LotteryAccountingClient } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingClient';
import { createKhataDataClient } from '../accounting/api';
import { LotteryLanguage } from './language';
import { runLottery } from './service';

const owner = '11111111-1111-7111-8111-111111111111';
const localScope = { ownerKind: 'PUBLIC_USER', ownerId: owner } as const;
const clock = () => new Date('2026-11-24T07:54:00Z');
afterEach(() => { cleanup(); sessionStorage.clear(); });

async function createOrg(name: string, state: unknown = {}) {
  const result = await runLottery(state, { method: 'createOrganization', payload: { name }, operationId: crypto.randomUUID() }, owner, clock);
  return { organization: result.result, state: result.state };
}

it('keeps a list failure separate from an actual empty organization list', async () => {
  const listOrganizations = vi.fn().mockRejectedValueOnce(new Error('private error detail')).mockResolvedValueOnce([]);
  const api = { listOrganizations } as unknown as LotteryAccountingClient;
  render(<LotteryLanguage.Provider value="hi">
    <LotteryAccountingWorkspace api={api} localScope={localScope} localStore={null} />
  </LotteryLanguage.Provider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('LOTTERY_UNAVAILABLE');
  expect(screen.queryByText('private error detail')).not.toBeInTheDocument();
  expect(screen.queryByText('Create your first accounting workspace')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'फिर से कोशिश करें' }));
  expect(await screen.findByText('Create your first accounting workspace')).toBeInTheDocument();
});

it('keeps an existing selection, offers retry, and never renders the creation form on failure', async () => {
  const { organization, state } = await createOrg('Existing agency');
  const workspace = (await runLottery(state, { method: 'getWorkspace', payload: { organizationId: organization.id } }, owner, clock)).result;
  const loadWorkspace = vi.fn().mockRejectedValueOnce(Object.assign(new Error('read failed'), {
    code: 'LOTTERY_UNAVAILABLE',
    workspaceDiagnostic: { startedAt: clock().toISOString(), stage: 'body', status: 200, privateRecord: 'NEVER_DISPLAY' },
  }))
    .mockResolvedValueOnce(workspace);
  const api = { listOrganizations: async () => [organization], loadWorkspace } as unknown as LotteryAccountingClient;
  render(<LotteryLanguage.Provider value="bn">
    <LotteryAccountingWorkspace api={api} localScope={localScope} localStore={null} />
  </LotteryLanguage.Provider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('LOTTERY_UNAVAILABLE');
  expect(screen.getByRole('combobox', { name: 'Accounting organization' })).toHaveValue(organization.id);
  expect(screen.queryByText('Create your first accounting workspace')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('সমস্যার তথ্য'));
  expect(screen.getByText(/"stage": "body"/u)).toBeVisible();
  expect(screen.queryByText(/NEVER_DISPLAY/u)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
  await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(loadWorkspace.mock.calls).toEqual([[organization.id], [organization.id]]);
});

it('discards an earlier organization response after a switch and retains the new selection', async () => {
  const first = await createOrg('First agency');
  const second = await createOrg('Second agency', first.state);
  const firstResponse = await runLottery(second.state, { method: 'getWorkspace', payload: { organizationId: first.organization.id } }, owner, clock);
  let resolveFirst!: (workspace: unknown) => void;
  const pendingFirst = new Promise(resolve => { resolveFirst = resolve; });
  const loadWorkspace = vi.fn((id: string) => id === first.organization.id
    ? pendingFirst : Promise.reject(new Error('LOTTERY_UNAVAILABLE')))
    .mockResolvedValueOnce(firstResponse.result);
  const api = { listOrganizations: async () => [first.organization, second.organization], loadWorkspace } as unknown as LotteryAccountingClient;
  render(<LotteryAccountingWorkspace api={api} localScope={localScope} localStore={null} />);
  const select = await screen.findByRole('combobox', { name: 'Accounting organization' });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh accounting workspace' }));
  await vi.waitFor(() => expect(loadWorkspace.mock.calls).toEqual([[first.organization.id], [first.organization.id]]));
  fireEvent.change(select, { target: { value: second.organization.id } });
  expect(await screen.findByRole('alert')).toHaveTextContent('LOTTERY_UNAVAILABLE');
  await act(async () => { resolveFirst(firstResponse.result); });
  expect(screen.getByRole('alert')).toHaveTextContent('LOTTERY_UNAVAILABLE');
  expect(select).toHaveValue(second.organization.id);
  expect(screen.queryByText('Create your first accounting workspace')).not.toBeInTheDocument();
});

it.each([330_000, 2_100_000, 3_000_000, 4_000_000, 6_000_000])(
  'distinguishes local calculation from the remote response boundary at %i audit characters',
  async auditSize => {
    const { organization, state } = await createOrg('Synthetic capacity');
    const auditEvent = {
      id: 'audit-fixture', organizationId: organization.id, createdAt: clock().toISOString(),
      metadata: { history: 'x'.repeat(auditSize) },
    };
    state.foundationLotteryAuditEvent.push(auditEvent);
    const result = await runLottery(state, { method: 'getWorkspace', payload: { organizationId: organization.id } }, owner, clock);
    expect(result.result.auditEvents).toContainEqual(auditEvent);
    expect(result.result.summary).toMatchObject({ verified: true, netCashFlowPaise: '0' });
    const fetchImpl = vi.fn(async () => Response.json({ data: result.result }));
    const remote = createKhataDataClient({ url: 'https://khata.example.test/data', token: async () => 'synthetic', fetchImpl });
    const request = remote('lottery', { method: 'getWorkspace', payload: { organizationId: organization.id } });
    if (auditSize < 2_000_000) await expect(request).resolves.toMatchObject({ organization: { id: organization.id } });
    else await expect(request).rejects.toThrow('KHATA_DATA_RESPONSE_INVALID');
    const compact = await runLottery(state, {
      method: 'getWorkspace', payload: { organizationId: organization.id, view: 'compact-v1' },
    }, owner, clock);
    expect(compact.result).toEqual({ ...result.result, historyView: 'compact-v1', auditEvents: [], ledgerEntries: [] });
    expect(compact.state.foundationLotteryAuditEvent).toContainEqual(auditEvent);
    expect(compact.changes).toEqual(result.changes);
    const bounded = createKhataDataClient({
      url: 'https://khata.example.test/data', token: async () => 'synthetic',
      fetchImpl: async () => Response.json({ data: compact.result }),
    });
    await expect(bounded('lottery', { method: 'getWorkspace' })).resolves.toMatchObject({ historyView: 'compact-v1' });
  },
);

it('loads a synthetic ₹22 lakh receipt with the exact cash balance', async () => {
  const { organization, state } = await createOrg('Synthetic high balance');
  const post = async (snapshot: unknown, method: string, payload: Record<string, unknown>) => runLottery(snapshot, {
    method, payload: { ...payload, organizationId: organization.id }, operationId: crypto.randomUUID(),
  }, owner, clock);
  const party = await post(state, 'createParty', { name: 'Synthetic seller', partyType: 'SELLER', ticketRatePaise: '1000' });
  const receipt = await post(party.state, 'recordPayment', {
    partyId: party.result.id, direction: 'RECEIPT', occurredAt: '2026-11-24',
    totalAmountPaise: '220000000', methodSplit: { cashPaise: '220000000' },
  });
  const { result } = await runLottery(receipt.state, { method: 'getWorkspace', payload: { organizationId: organization.id } }, owner, clock);
  expect(result.summary.methodBalances.cashPaise).toBe('220000000');
  expect(result.payments[0].id).toBe(receipt.result.payment.id);
  expect(JSON.stringify(result).length).toBeLessThan(2_000_000);
  const compact = await runLottery(receipt.state, {
    method: 'getWorkspace', payload: { organizationId: organization.id, view: 'compact-v1' },
  }, owner, clock);
  expect(compact.result).toEqual({...result, historyView:'compact-v1', auditEvents:[], ledgerEntries:[]});
  expect(compact.state.foundationLotteryLedgerEntry).toEqual(receipt.state.foundationLotteryLedgerEntry);
  expect(compact.changes).toEqual([]);
});
