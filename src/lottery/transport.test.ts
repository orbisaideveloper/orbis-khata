import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
const bridge=vi.hoisted(()=>({request:vi.fn(),session:vi.fn()}));
vi.mock('../accounting/api',()=>({requestKhata:bridge.request}));
vi.mock('../auth/client',()=>({authClient:{auth:{getSession:bridge.session}}}));
import {lotteryAccountingClient as api} from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingClient';
import {lotteryFetch} from './transport';
afterEach(()=>vi.unstubAllGlobals());
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());sessionStorage.clear();bridge.request.mockReset().mockResolvedValue({});bridge.session.mockReset().mockResolvedValue({data:{session:{user:{id:'owner'}}}});});
it('routes every inherited form into only the Khata lottery gateway with original response shapes',async()=>{
 const payload={organizationId:'org',partyId:'party'};
 const calls:[()=>Promise<unknown>,string][]=[
  [()=>api.createOrganization({name:'Shop'}),'createOrganization'],[()=>api.createParty(payload),'createParty'],[()=>api.updatePartyProfile(payload),'updatePartyProfile'],[()=>api.updateOrganizationTdsRate({organizationId:'org',tdsRateBps:200}),'updateOrganizationTdsRate'],[()=>api.updateUserLedgerStorage({organizationId:'org',userLedgerStorage:'CLOUD'}),'updateUserLedgerStorage'],[()=>api.createPeriod(payload),'createPeriod'],[()=>api.createFinancialYearPeriod(payload),'createFinancialYearPeriod'],[()=>api.recordStockMovement(payload),'recordStockMovement'],[()=>api.saveDailyStockistEntry(payload),'saveDailyStockistEntry'],[()=>api.clearDailyEntries({organizationId:'org',occurredAt:'2026-10-30',scope:'ALL'}),'clearDailyEntries'],[()=>api.recordSale(payload),'recordSale'],[()=>api.saveDailySellerDraft(payload),'createDailySellerDraft'],[()=>api.updateDailySellerDraft('sale',payload),'updateDailySellerDraft'],[()=>api.deleteDailySellerDraft('sale',payload),'deleteDailySellerDraft'],[()=>api.postDailySellerDraft('sale',payload),'postDailySellerDraft'],[()=>api.correctPostedSale('sale',payload),'correctPostedSale'],[()=>api.recordPayment(payload),'recordPayment'],[()=>api.recordSettlement(payload),'recordSettlement'],[()=>api.createExpenseCategory(payload),'createExpenseCategory'],[()=>api.updateExpenseCategory('cat',payload),'updateExpenseCategory'],[()=>api.createExpenseProfile(payload),'createExpenseProfile'],[()=>api.updateExpenseProfile('profile',payload),'updateExpenseProfile'],[()=>api.recordExpenseBill(payload),'recordExpenseBill'],[()=>api.recordExpensePayment(payload),'recordExpensePayment'],[()=>api.recordCustomerBill(payload),'recordCustomerBill'],[()=>api.previewAccountingVoid!('PAYMENT','p',payload),'previewAccountingVoid'],[()=>api.voidAccountingTransaction!('PAYMENT','p',payload),'voidAccountingTransaction'],[()=>api.correctAccountingTransaction!('PAYMENT','p',payload),'correctAccountingTransaction'],
 ];
 for(const [call,method] of calls){
  if(method==='recordPayment')bridge.request.mockResolvedValueOnce({payment:{id:'receipt'}});
  await call();
  expect(bridge.request.mock.lastCall?.slice(0,2)).toEqual(['lottery',expect.objectContaining({method,payload:expect.any(Object)})]);
 }
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

it('reuses the actual payment save ID after a lost response and tab storage reset',async()=>{
 const payload={organizationId:'org',partyId:'party',totalAmountPaise:'100'};
 bridge.request.mockRejectedValueOnce(Error('ACK lost'));
 await expect(api.recordPayment(payload)).rejects.toThrow();
 const first=bridge.request.mock.lastCall?.[1].operationId;
 expect(bridge.request.mock.lastCall?.[2]).toBe('owner');
 sessionStorage.clear();
 bridge.request.mockResolvedValueOnce({});
 await expect(api.recordPayment(payload)).rejects.toMatchObject({code:'LOTTERY_PAYMENT_CONFIRMATION_REQUIRED'});
 expect(bridge.request.mock.lastCall?.[1].operationId).toBe(first);
 bridge.request.mockResolvedValueOnce({payment:{id:'paid-first'}});
 await expect(api.recordPayment(payload)).resolves.toEqual({id:'paid-first'});
 expect(bridge.request.mock.lastCall?.[1].operationId).toBe(first);
 bridge.request.mockResolvedValueOnce({payment:{id:'paid-second'}});
 await expect(api.recordPayment(payload)).resolves.toEqual({id:'paid-second'});
 expect(bridge.request.mock.lastCall?.[1].operationId).not.toBe(first);
});

it('does not send a payment when durable storage is unavailable',async()=>{
 vi.stubGlobal('indexedDB',undefined);
 await expect(api.recordPayment({organizationId:'org'})).rejects.toMatchObject({code:'LOTTERY_PAYMENT_STORAGE_UNAVAILABLE'});
 expect(bridge.request).not.toHaveBeenCalled();
});

it('adopts the previous tab attempt without changing its operation ID',async()=>{
 const payload={organizationId:'org',partyId:'party',totalAmountPaise:'100'};
 const signature=JSON.stringify(payload);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));
 const fingerprint=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
 const key='orbis.lottery.pending.v1:owner:recordPayment:'+fingerprint;
 const id=crypto.randomUUID();
 sessionStorage.setItem(key,JSON.stringify({id,signature}));
 bridge.request.mockResolvedValueOnce({payment:{id:'original'}});
 await expect(api.recordPayment(payload)).resolves.toEqual({id:'original'});
 expect(bridge.request.mock.lastCall?.[1].operationId).toBe(id);
 expect(sessionStorage.getItem(key)).toBeNull();
});
