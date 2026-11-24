import {requestKhata} from '../accounting/api';
import {authClient} from '../auth/client';
import {androidLocalFirst} from '../native-local/route';
import {isLotteryRead} from './protocol';
import {workspaceDiagnosticFrom} from './workspace-diagnostic';
import {compactWorkspace} from './workspace-history';
import { beginPaymentAttempt, confirmPaymentAttempt } from './payment-attempt';
async function lotteryOwner() {
 if (androidLocalFirst()) return (await import('../native-local/runtime')).nativeLocalActor();
 const session = await authClient?.auth.getSession();
 if (session?.error) throw new Error(session.error.code === 'CUSTOMER_LOGIN_REQUIRED'
  ? 'LOTTERY_LOGIN_REQUIRED' : 'LOTTERY_SESSION_UNAVAILABLE');
 return session?.data.session?.user.id;
}
type Route={method:string;payload:Record<string,unknown>};
function resolveRoute(path:string,init:RequestInit):Route{
 const url=new URL(path,'https://lottery.internal'),suffix=url.pathname.split('/lottery')[1]??'';
 if(init.body&&typeof init.body!=='string')throw new Error('LOTTERY_BODY_INVALID');
 const payload=typeof init.body==='string'?JSON.parse(init.body):Object.fromEntries(url.searchParams);
 const verb=init.method??'GET';
 if (verb === 'GET' && suffix === '/workspace/history') return {method:'getWorkspaceHistory',payload};
 if (verb === 'GET' && suffix === '/workspace' && !androidLocalFirst()) return {method:'getWorkspace',payload:{...payload,view:compactWorkspace}};
 const fixed:Record<string,string>={'GET /organizations':'listOrganizations','GET /workspace':'getWorkspace','POST /organizations':'createOrganization','POST /parties':'createParty','PATCH /settings/tds-rate':'updateOrganizationTdsRate','PATCH /settings/payment-options':'updateOrganizationPreferences','PATCH /settings/user-ledger-storage':'updateUserLedgerStorage','POST /periods':'createPeriod','POST /periods/financial-year':'createFinancialYearPeriod','POST /stock-movements':'recordStockMovement','POST /daily-stockist-entries':'saveDailyStockistEntry','POST /daily-entry-clearances':'clearDailyEntries','POST /sales/preview':'previewSale','POST /sales':'recordSale','POST /daily-seller-drafts':'createDailySellerDraft','POST /payments':'recordPayment','POST /settlements':'recordSettlement','POST /expenses/categories':'createExpenseCategory','POST /expenses/profiles':'createExpenseProfile','POST /expenses/bills':'recordExpenseBill','POST /expenses/payments':'recordExpensePayment','POST /customer-bills':'recordCustomerBill','GET /summary':'getVerifiedSummary','GET /analyze':'analyzeVerifiedAccounting'};
 const method=fixed[verb+' '+suffix];if(method)return {method,payload};
 return dynamicRoute(suffix,verb,payload);
}
function dynamicMethod(root:string,verb:string,action:string,preview:boolean){
 if(root==='daily-seller-drafts'){
  if(action==='post')return 'postDailySellerDraft';
  return verb==='DELETE'?'deleteDailySellerDraft':'updateDailySellerDraft';
 }
 if(root==='corrections')return 'correctAccountingTransaction';
 return preview?'previewAccountingVoid':'voidAccountingTransaction';
}
function dynamicRoute(path:string,verb:string,payload:Record<string,unknown>):Route{
 const parts=path.split('/').filter(Boolean),[root,id,action]=parts;
 if(root==='parties'&&action==='profile')return {method:'updatePartyProfile',payload:{...payload,partyId:id}};
 if(root==='daily-seller-drafts')return {method:dynamicMethod(root,verb,action,false),payload:{...payload,saleId:id}};
 if(root==='sales'&&action==='correct')return {method:'correctPostedSale',payload:{...payload,saleId:id}};
 if(root==='corrections'||root==='voids')return {method:dynamicMethod(root,verb,action,parts[3]==='preview'),payload:{...payload,entityType:id,entityId:action}};
 if(root==='expenses'&&(id==='categories'||id==='profiles')) {
  let method='updateExpenseProfile';
  if(id==='categories')method=verb==='DELETE'?'deleteExpenseCategory':'updateExpenseCategory';
  return {method,payload:{...payload,[id==='categories'?'categoryId':'profileId']:action}};
 }
 throw new Error('LOTTERY_ROUTE_NOT_SUPPORTED');
}
const responseKey:Record<string,string>={listOrganizations:'organizations',getWorkspace:'workspace',createOrganization:'organization',saveDailyStockistEntry:'entry',previewAccountingVoid:'preview',voidAccountingTransaction:'deletion',correctAccountingTransaction:'correction'};
function lotteryResponse(method:string,result:unknown){
 if(result&&typeof result==='object'&&'lotteryError' in result)return Response.json({error:{code:result.lotteryError,...('currentVersion' in result?{currentVersion:result.currentVersion}:{})}},{status:422});
 const wrapped=responseKey[method];return Response.json(wrapped?{[wrapped]:result}:result??{});
}
function lotteryFailureCode(method: string, error: unknown): string {
 if (error && typeof error === 'object' && 'reason' in error) return String(error.reason);
 if (!(error instanceof Error)) return 'LOTTERY_UNAVAILABLE';
 if (method === 'recordPayment' && error.message === 'LOTTERY_PAYMENT_STORAGE_UNAVAILABLE') return error.message;
 if (method === 'getWorkspace' &&
  ['KHATA_DATA_RESPONSE_INVALID', 'LOTTERY_WORKSPACE_RESPONSE_INVALID'].includes(error.message)) return error.message;
 if (androidLocalFirst() && /^[A-Z][A-Z0-9_]{2,79}$/u.test(error.message)) return error.message;
 return 'LOTTERY_UNAVAILABLE';
}

async function lotterySession(): Promise<string | Response> {
 try {
  const owner = await lotteryOwner();
  return owner || Response.json({error:{code:'LOTTERY_LOGIN_REQUIRED'}},{status:401});
 }
 catch (error) {
  const login = error instanceof Error && error.message === 'LOTTERY_LOGIN_REQUIRED';
  return Response.json({error:{code:login?'LOTTERY_LOGIN_REQUIRED':'LOTTERY_SESSION_UNAVAILABLE'}},{status:login?401:503});
 }
}

function legacyAttempt(key: string, signature: string): string | undefined {
 const raw=sessionStorage.getItem(key);
 if (raw === null) return undefined;
 const pending: unknown = JSON.parse(raw);
 if (pending && typeof pending === 'object' && 'signature' in pending && pending.signature === signature &&
     'id' in pending && typeof pending.id === 'string') return pending.id;
 return undefined;
}

function confirmedPayment(result: unknown): boolean {
 if (!result || typeof result !== 'object' || !('payment' in result)) return false;
 const payment = result.payment;
 return Boolean(payment && typeof payment === 'object' && 'id' in payment &&
   typeof payment.id === 'string' && payment.id.length > 0);
}

async function savePayment(route: Route, actor: string, key: string, signature: string): Promise<Response> {
 if (typeof indexedDB === 'undefined') throw new Error('LOTTERY_PAYMENT_STORAGE_UNAVAILABLE');
 const legacyId = legacyAttempt(key, signature);
 const operationId = await beginPaymentAttempt(indexedDB, key, legacyId);
 // The durable attempt owns recovery once committed, including an older matching tab attempt.
 if (legacyId) sessionStorage.removeItem(key);
 const result = await requestKhata<unknown>('lottery', { ...route, operationId }, actor);
 const response = lotteryResponse(route.method, result);
 if (!response.ok) return response;
 if (!confirmedPayment(result)) return Response.json({error:{code:'LOTTERY_PAYMENT_CONFIRMATION_REQUIRED'}},{status:503});
 await confirmPaymentAttempt(indexedDB, key, operationId);
 return response;
}

export async function lotteryFetch(path:string,init:RequestInit={}):Promise<Response>{
 const route=resolveRoute(path,init);
 const owner=await lotterySession();
 if(typeof owner!=='string')return owner;
 try {
  if (isLotteryRead(route.method)) return lotteryResponse(route.method, await requestKhata<unknown>('lottery', route));
  const signature=JSON.stringify(route.payload);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));
  const fingerprint=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
  const key='orbis.lottery.pending.v1:'+owner+':'+route.method+':'+fingerprint;
  if(route.method==='recordPayment')return await savePayment(route,owner,key,signature);
  let operationId: string | undefined;
  try { operationId=legacyAttempt(key,signature); }catch{/* Keep the existing non-payment path. */}
  operationId??=crypto.randomUUID();
  sessionStorage.setItem(key,JSON.stringify({id:operationId,signature}));
  const result=await requestKhata<unknown>('lottery',{...route,operationId});
  const response=lotteryResponse(route.method,result);
  if(response.ok)sessionStorage.removeItem(key);
  return response;
 }catch(error){
  const diagnostic=route.method==='getWorkspace'?workspaceDiagnosticFrom(error):undefined;
  return Response.json({error:{code:lotteryFailureCode(route.method,error),diagnostic}},{status:422});
 }
}
