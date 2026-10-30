import {beforeEach,expect,it,vi} from 'vitest';
const bridge=vi.hoisted(()=>({request:vi.fn(),session:vi.fn()}));
vi.mock('../accounting/api',()=>({requestKhata:bridge.request}));
vi.mock('../auth/client',()=>({authClient:{auth:{getSession:bridge.session}}}));
import {lotteryAccountingClient as api} from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingClient';
import {lotteryFetch} from './transport';
beforeEach(()=>{sessionStorage.clear();bridge.request.mockReset().mockResolvedValue({});bridge.session.mockReset().mockResolvedValue({data:{session:{user:{id:'owner'}}}});});
it('routes every inherited form into only the Khata lottery gateway with original response shapes',async()=>{
 const payload={organizationId:'org',partyId:'party'};
 const calls:[()=>Promise<unknown>,string][]=[
  [()=>api.createOrganization({name:'Shop'}),'createOrganization'],[()=>api.createParty(payload),'createParty'],[()=>api.updatePartyProfile(payload),'updatePartyProfile'],[()=>api.updateOrganizationTdsRate({organizationId:'org',tdsRateBps:200}),'updateOrganizationTdsRate'],[()=>api.updateUserLedgerStorage({organizationId:'org',userLedgerStorage:'CLOUD'}),'updateUserLedgerStorage'],[()=>api.createPeriod(payload),'createPeriod'],[()=>api.createFinancialYearPeriod(payload),'createFinancialYearPeriod'],[()=>api.recordStockMovement(payload),'recordStockMovement'],[()=>api.saveDailyStockistEntry(payload),'saveDailyStockistEntry'],[()=>api.clearDailyEntries({organizationId:'org',occurredAt:'2026-10-30',scope:'ALL'}),'clearDailyEntries'],[()=>api.recordSale(payload),'recordSale'],[()=>api.saveDailySellerDraft(payload),'createDailySellerDraft'],[()=>api.updateDailySellerDraft('sale',payload),'updateDailySellerDraft'],[()=>api.deleteDailySellerDraft('sale',payload),'deleteDailySellerDraft'],[()=>api.postDailySellerDraft('sale',payload),'postDailySellerDraft'],[()=>api.correctPostedSale('sale',payload),'correctPostedSale'],[()=>api.recordPayment(payload),'recordPayment'],[()=>api.recordSettlement(payload),'recordSettlement'],[()=>api.createExpenseCategory(payload),'createExpenseCategory'],[()=>api.updateExpenseCategory('cat',payload),'updateExpenseCategory'],[()=>api.createExpenseProfile(payload),'createExpenseProfile'],[()=>api.updateExpenseProfile('profile',payload),'updateExpenseProfile'],[()=>api.recordExpenseBill(payload),'recordExpenseBill'],[()=>api.recordExpensePayment(payload),'recordExpensePayment'],[()=>api.recordCustomerBill(payload),'recordCustomerBill'],[()=>api.previewAccountingVoid!('PAYMENT','p',payload),'previewAccountingVoid'],[()=>api.voidAccountingTransaction!('PAYMENT','p',payload),'voidAccountingTransaction'],[()=>api.correctAccountingTransaction!('PAYMENT','p',payload),'correctAccountingTransaction'],
 ];
 for(const [call,method] of calls){await call();expect(bridge.request).toHaveBeenLastCalledWith('lottery',expect.objectContaining({method,payload:expect.any(Object)}));}
 bridge.request.mockResolvedValueOnce([{id:'org'}]);expect(await api.listOrganizations()).toEqual([{id:'org'}]);
 bridge.request.mockResolvedValueOnce({organization:{id:'org'}});expect(await api.loadWorkspace('org')).toEqual({organization:{id:'org'}});
 bridge.request.mockResolvedValueOnce({sale:{id:'draft'}});expect(await api.saveDailySellerDraft(payload)).toEqual({id:'draft'});
 bridge.request.mockResolvedValueOnce({payment:{id:'payment'}});expect(await api.recordPayment(payload)).toEqual({id:'payment'});
 bridge.request.mockResolvedValueOnce({calculated:{netPayablePaise:'90200'},ledger:[]});expect(await api.previewSale(payload)).toHaveProperty('calculated.netPayablePaise','90200');
});
it('persists distinct operation IDs for uncertain retries, including simultaneous different payloads',async()=>{
 bridge.request.mockRejectedValueOnce(Error('offline'));
 await expect(api.createParty({name:'First'})).rejects.toThrow();const first=bridge.request.mock.calls[0][1].operationId;
 await api.createParty({name:'Second'});expect(bridge.request.mock.calls[1][1].operationId).not.toBe(first);
 await api.createParty({name:'First'});expect(bridge.request.mock.calls[2][1].operationId).toBe(first);
 await api.createParty({name:'First'});expect(bridge.request.mock.calls[3][1].operationId).not.toBe(first);
});
it('requires central login, preserves business errors and rejects unsupported routes',async()=>{
 bridge.session.mockResolvedValueOnce({data:{session:null}});await expect(api.listOrganizations()).rejects.toThrow('LOTTERY LOGIN REQUIRED');expect(bridge.request).not.toHaveBeenCalled();
 bridge.request.mockResolvedValueOnce({lotteryError:'INVALID_PAYMENT'});await expect(api.recordPayment({})).rejects.toMatchObject({code:'INVALID_PAYMENT'});
 bridge.request.mockRejectedValueOnce({reason:'WRITES_DISABLED'});await expect(api.recordPayment({})).rejects.toMatchObject({code:'WRITES_DISABLED'});
 await expect(lotteryFetch('/unknown')).rejects.toThrow('LOTTERY_ROUTE_NOT_SUPPORTED');
});
