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
 expect(bridge.request).toHaveBeenLastCalledWith('lottery',{method:'getWorkspace',payload:{organizationId:'org',view:'compact-v1'}});
 bridge.request.mockResolvedValueOnce({sale:{id:'draft'}});expect(await api.saveDailySellerDraft(payload)).toEqual({id:'draft'});
 bridge.request.mockResolvedValueOnce({payment:{id:'payment'}});expect(await api.recordPayment(payload)).toEqual({id:'payment'});
 bridge.request.mockResolvedValueOnce({calculated:{netPayablePaise:'90200'},ledger:[]});expect(await api.previewSale(payload)).toHaveProperty('calculated.netPayablePaise','90200');
});

it('distinguishes a transient Central session outage from missing credentials and retries with a recovered session',async()=>{
 bridge.session.mockResolvedValueOnce({data:{session:null},error:{code:'CENTRAL_ACCOUNT_UNAVAILABLE'}});
 await expect(api.loadWorkspace('org')).rejects.toMatchObject({code:'LOTTERY_SESSION_UNAVAILABLE'});
 expect(bridge.request).not.toHaveBeenCalled();
 bridge.session.mockResolvedValueOnce({data:{session:null},error:{code:'CUSTOMER_LOGIN_REQUIRED'}});
 await expect(api.loadWorkspace('org')).rejects.toMatchObject({code:'LOTTERY_LOGIN_REQUIRED'});
 expect(bridge.request).not.toHaveBeenCalled();
 bridge.request.mockResolvedValueOnce({organization:{id:'org'}});
 await expect(api.loadWorkspace('org')).resolves.toMatchObject({organization:{id:'org'}});
 expect(bridge.request).toHaveBeenCalledTimes(1);
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

it('rejects non-JSON request bodies before accessing the gateway',async()=>{
 await expect(lotteryFetch('/organizations',{method:'POST',body:new URLSearchParams({name:'Shop'})})).rejects.toThrow('LOTTERY_BODY_INVALID');
 expect(bridge.request).not.toHaveBeenCalled();
});

it('keeps the known workspace size diagnostic and conceals unexpected error details',async()=>{
 bridge.request.mockRejectedValueOnce(Object.assign(new Error('KHATA_DATA_RESPONSE_INVALID'), {
  workspaceDiagnostic:{startedAt:'2026-11-24T07:43:00.000Z',stage:'size',status:200,decodedChars:2200000,token:'never copy'},
 }));
 const failure=await api.loadWorkspace('org').catch((cause:unknown)=>cause);
 expect(failure).toMatchObject({code:'KHATA_DATA_RESPONSE_INVALID',workspaceDiagnostic:{stage:'size',status:200,decodedChars:2200000}});
 expect(JSON.stringify(failure)).not.toContain('never copy');
 bridge.request.mockRejectedValueOnce(new Error('internal details'));
 await expect(api.loadWorkspace('org')).rejects.toMatchObject({code:'LOTTERY_UNAVAILABLE'});
});

it('returns the server-created party identity for a master invitation without a second account lookup',async()=>{bridge.request.mockResolvedValueOnce({id:'created-party'});expect(await api.createParty({name:'New seller'})).toEqual({id:'created-party'});});
