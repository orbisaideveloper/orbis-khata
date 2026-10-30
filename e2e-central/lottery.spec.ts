import {test,expect} from '@playwright/test';
import {runLottery,type LotteryInput} from '../src/lottery/service';
test('independent lottery creates masters, saves daily formulas, receives split payment and restores after reload',async({page})=>{
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'};let state:unknown={};const methods:string[]=[];
 const replies=new Map<string,{request:string;result:unknown}>();
 const headers={'access-control-allow-origin':'http://127.0.0.1:4187','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
 await page.clock.setFixedTime(new Date('2026-10-30T10:00:00Z'));
 await page.addInitScript(customer=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1','en');},customer);
 await page.route('https://admin.example.test/**',r=>r.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return;}
  const {operation,input}=route.request().postDataJSON();expect(operation).toBe('lottery');const request=input as LotteryInput;methods.push(request.method);
  try{
   const prior=request.operationId?replies.get(request.operationId):undefined;
   if(prior){expect(prior.request).toBe(JSON.stringify(input));await route.fulfill({headers,json:{data:prior.result}});return;}
   const answer=await runLottery(state,request,customer.orbisIdentityId,()=>new Date('2026-10-30T10:00:00Z'));state=JSON.parse(JSON.stringify(answer.state));
   if(request.operationId)replies.set(request.operationId,{request:JSON.stringify(input),result:answer.result});
   await route.fulfill({headers,json:{data:answer.result}});
  }catch(error){await route.fulfill({headers,json:{data:{lotteryError:error instanceof Error?error.message:'ERROR'}}});}
 });
 await page.goto('/');await page.getByRole('button',{name:/Lottery.*Open/}).click();
 await page.getByLabel('Business organization name').fill('Independent lottery');await page.getByRole('button',{name:'Create',exact:true}).click();
 const tabs=page.getByLabel('Accounting workspace sections');await tabs.getByRole('button',{name:'Masters',exact:true}).click();
 async function party(type:string,name:string,rate:string){await page.getByRole('button',{name:type,exact:true}).click();await page.getByRole('button',{name:'+ Add '+type}).click();await page.getByLabel('Party name').fill(name);await page.getByLabel('Party fixed rate').fill(rate);await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByLabel('Party name')).toHaveCount(0);}
 await party('Seller','Test seller','10');await party('Stockist','Test stockist','9');
 await tabs.getByRole('button',{name:'Daily entry',exact:true}).click();await page.getByRole('button',{name:'Stockist Purchase',exact:true}).click();
 await page.getByLabel('Test stockist purchase', {exact:true}).fill('100');await page.getByLabel('Test stockist commission amount').fill('40');await page.getByRole('button',{name:'Save table',exact:true}).click();
 await expect.poll(()=>methods.filter(m=>m==='saveDailyStockistEntry').length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Seller Sale',exact:true}).click();
 await page.getByLabel('Test seller dispatch',{exact:true}).fill('100');await page.getByLabel('Test seller morning return',{exact:true}).fill('5');await page.getByLabel('Test seller day return',{exact:true}).fill('10');await page.getByLabel('Test seller evening return',{exact:true}).fill('5');await page.getByLabel('Test seller commission amount').fill('40');await page.getByRole('button',{name:'Save table',exact:true}).click();
 await expect.poll(()=>methods.filter(m=>m==='createDailySellerDraft').length).toBeGreaterThan(0);
 await page.screenshot({path:test.info().outputPath('lottery-daily.png'),fullPage:true});
 await tabs.getByRole('button',{name:'Payment',exact:true}).click();await page.getByLabel('Payment Cash',{exact:true}).fill('100');await page.getByLabel('Payment Bank',{exact:true}).fill('50');await page.getByRole('button',{name:/^Receive/}).click();
 await expect.poll(()=>methods.filter(m=>m==='recordPayment').length).toBeGreaterThan(0);
 await page.reload();await expect(page.getByLabel('Accounting organization')).toContainText('Independent lottery');
 await page.getByLabel('Accounting workspace sections').getByRole('button',{name:'Daily entry',exact:true}).click();await expect(page.getByLabel('Test seller dispatch',{exact:true})).toHaveValue('100');
 const result=await runLottery(state,{method:'getWorkspace',payload:{organizationId:(await runLottery(state,{method:'listOrganizations',payload:{}},customer.orbisIdentityId)).result[0].id}},customer.orbisIdentityId,()=>new Date('2026-10-30T10:00:00Z'));
 expect(result.result.draftSales[0]).toMatchObject({grossSalesPaise:'80000',tdsPaise:'80',netPayablePaise:'76080'});expect(result.result.payments[0].methodSplit).toMatchObject({cashPaise:'10000',bankPaise:'5000'});
 await page.getByLabel('Accounting workspace sections').getByRole('button',{name:'Ledger',exact:true}).click();await page.screenshot({path:test.info().outputPath('lottery-ledger.png'),fullPage:true});
 expect(await page.locator('.lottery-module').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
