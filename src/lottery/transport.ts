import {requestKhata} from '../accounting/api';
import {authClient} from '../auth/client';
type Route={method:string;payload:Record<string,unknown>};
function resolveRoute(path:string,init:RequestInit):Route{
 const url=new URL(path,'https://lottery.internal'),suffix=url.pathname.split('/lottery')[1]??'';
 if(init.body&&typeof init.body!=='string')throw new Error('LOTTERY_BODY_INVALID');
 const payload=typeof init.body==='string'?JSON.parse(init.body):Object.fromEntries(url.searchParams);
 const verb=init.method??'GET';
 const fixed:Record<string,string>={'GET /organizations':'listOrganizations','GET /workspace':'getWorkspace','POST /organizations':'createOrganization','POST /parties':'createParty','PATCH /settings/tds-rate':'updateOrganizationTdsRate','PATCH /settings/user-ledger-storage':'updateUserLedgerStorage','POST /periods':'createPeriod','POST /periods/financial-year':'createFinancialYearPeriod','POST /stock-movements':'recordStockMovement','POST /daily-stockist-entries':'saveDailyStockistEntry','POST /daily-entry-clearances':'clearDailyEntries','POST /sales/preview':'previewSale','POST /sales':'recordSale','POST /daily-seller-drafts':'createDailySellerDraft','POST /payments':'recordPayment','POST /settlements':'recordSettlement','POST /expenses/categories':'createExpenseCategory','POST /expenses/profiles':'createExpenseProfile','POST /expenses/bills':'recordExpenseBill','POST /expenses/payments':'recordExpensePayment','POST /customer-bills':'recordCustomerBill','GET /summary':'getVerifiedSummary','GET /analyze':'analyzeVerifiedAccounting'};
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
 if(root==='expenses'&&(id==='categories'||id==='profiles'))return {method:id==='categories'?'updateExpenseCategory':'updateExpenseProfile',payload:{...payload,[id==='categories'?'categoryId':'profileId']:action}};
 throw new Error('LOTTERY_ROUTE_NOT_SUPPORTED');
}
const readMethods=new Set(['listOrganizations','getWorkspace','previewSale','getVerifiedSummary','analyzeVerifiedAccounting','previewAccountingVoid']);
const responseKey:Record<string,string>={listOrganizations:'organizations',getWorkspace:'workspace',createOrganization:'organization',saveDailyStockistEntry:'entry',previewAccountingVoid:'preview',voidAccountingTransaction:'deletion',correctAccountingTransaction:'correction'};
function lotteryResponse(method:string,result:unknown){
 if(result&&typeof result==='object'&&'lotteryError' in result)return Response.json({error:{code:result.lotteryError,...('currentVersion' in result?{currentVersion:result.currentVersion}:{})}},{status:422});
 const wrapped=responseKey[method];return Response.json(wrapped?{[wrapped]:result}:result??{});
}
export async function lotteryFetch(path:string,init:RequestInit={}):Promise<Response>{
 const route=resolveRoute(path,init);const session=await authClient?.auth.getSession();const owner=session?.data.session?.user.id;
 if(!owner)return Response.json({error:{code:'LOTTERY_LOGIN_REQUIRED'}},{status:401});
 const read=readMethods.has(route.method);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(route.payload)));const signatureKey=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');const key='orbis.lottery.pending.v1:'+owner+':'+route.method+':'+signatureKey;
 let operationId:string|undefined;
 if(!read){const signature=JSON.stringify(route.payload);let pending;try{pending=JSON.parse(sessionStorage.getItem(key)??'null');}catch{/* Use a fresh operation if storage is unavailable. */}operationId=pending?.signature===signature?pending.id:crypto.randomUUID();sessionStorage.setItem(key,JSON.stringify({id:operationId,signature}));}
 try{
  const result=await requestKhata<unknown>('lottery',{...route,...(operationId?{operationId}:{})});
  const response=lotteryResponse(route.method,result);
  if(response.ok&&!read)sessionStorage.removeItem(key);
  return response;
 }catch(error){
  const reason=error&&typeof error==='object'&&'reason' in error?String(error.reason):'LOTTERY_UNAVAILABLE';
  return Response.json({error:{code:reason}},{status:422});
 }
}
