import {test,expect} from '@playwright/test';
import {runLottery,type LotteryInput} from '../src/lottery/service';
test('independent lottery creates masters, saves daily formulas, receives split payment and restores after reload',async({page})=>{
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'};let state:unknown={};const methods:string[]=[];let failNextDraft=false;
 const replies=new Map<string,{request:string;result:unknown}>();
 let requestQueue=Promise.resolve();
 const headers={'access-control-allow-origin':'http://127.0.0.1:4187','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
 await page.clock.setFixedTime(new Date('2026-10-30T10:00:00Z'));
 await page.addInitScript(customer=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1','en');},customer);
 await page.route('https://admin.example.test/**',r=>r.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return;}
  const {operation,input}=route.request().postDataJSON();if(operation==='companies'||operation==='retired-companies'){await route.fulfill({headers,json:{data:[]}});return;}expect(operation).toBe('lottery');const request=input as LotteryInput;methods.push(request.method);
  // Match the production owner lock: reads and writes share one transaction queue.
  const previous=requestQueue;let unlock!:()=>void;
  requestQueue=new Promise<void>(resolve=>{unlock=resolve;});await previous;
  try{
   // Exercise a slow second receipt so a request-start check cannot pass as a save.
   if(request.method==='recordPayment'&&request.payload.totalAmountPaise==='3000')await new Promise(resolve=>setTimeout(resolve,150));
   if(failNextDraft&&request.method==='updateDailySellerDraft'){failNextDraft=false;await route.fulfill({headers,json:{data:{lotteryError:'TEST_SAVE_FAILED'}}});return;}
   const prior=request.operationId?replies.get(request.operationId):undefined;
   if(prior){expect(prior.request).toBe(JSON.stringify(input));await route.fulfill({headers,json:{data:prior.result}});return;}
   const answer=await runLottery(state,request,customer.orbisIdentityId,()=>new Date('2026-10-30T10:00:00Z'));state=JSON.parse(JSON.stringify(answer.state));
   if(request.operationId)replies.set(request.operationId,{request:JSON.stringify(input),result:answer.result});
   await route.fulfill({headers,json:{data:answer.result}});
  }catch(error){await route.fulfill({headers,json:{data:{lotteryError:error instanceof Error?error.message:'ERROR'}}});}finally{unlock();}
 });
 await page.goto('/');await page.getByRole('button',{name:/Lottery.*Open/}).click();
 await page.getByLabel('Business organization name').fill('Independent lottery');await page.getByRole('button',{name:'Create',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
 const tabs=page.getByLabel('Accounting workspace sections');await tabs.getByRole('button',{name:'Masters',exact:true}).click();
 async function party(type:string,name:string,rate:string){await page.getByRole('button',{name:type,exact:true}).click();await page.getByRole('button',{name:'+ Add '+type}).click();await page.getByLabel('Party name').fill(name);await page.getByLabel('Party fixed rate').fill(rate);await page.getByLabel('Opening balance amount').fill(type==='Seller'?'500':'250');await page.getByLabel('Opening balance date').fill('2026-10-29');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByLabel('Party name')).toHaveCount(0);}
 await party('Seller','Test seller','10');await party('Stockist','Test stockist','9');
 await tabs.getByRole('button',{name:'Daily entry',exact:true}).click();await page.getByRole('button',{name:'Stockist Purchase',exact:true}).click();
 await page.getByLabel('Test stockist purchase', {exact:true}).fill('100');await page.getByLabel('Test stockist commission amount').fill('40');await page.getByRole('button',{name:'Save table',exact:true}).click();
 await expect.poll(()=>methods.filter(m=>m==='saveDailyStockistEntry').length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Seller Sale',exact:true}).click();
 await page.getByLabel('Test seller dispatch',{exact:true}).fill('100');await page.getByLabel('Test seller morning return',{exact:true}).fill('5');await page.getByLabel('Test seller day return',{exact:true}).fill('10');await page.getByLabel('Test seller evening return',{exact:true}).fill('5');await page.getByLabel('Test seller commission amount').fill('40');await page.getByRole('button',{name:'Save table',exact:true}).click();
 await expect.poll(()=>methods.filter(m=>m==='createDailySellerDraft').length).toBeGreaterThan(0);
 await page.screenshot({path:test.info().outputPath('lottery-daily.png'),fullPage:true});
 await page.getByLabel('Receipt Cash',{exact:true}).fill('100');await page.getByLabel('Receipt Bank',{exact:true}).fill('50');await page.getByLabel('Receipt PWD',{exact:true}).fill('20');failNextDraft=true;await page.getByRole('button',{name:'Save receipt',exact:true}).click();await expect(page.getByLabel('Test seller receipt').getByRole('alert')).toBeVisible();await expect(page.getByLabel('Receipt Cash')).toHaveValue('100');expect(methods.filter(m=>m==='recordPayment')).toHaveLength(0);await page.getByRole('button',{name:'Save receipt',exact:true}).click();
 await expect(page.getByLabel('Receipt Cash')).toHaveValue('');await expect(page.getByText('₹1,090.80',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Table view/}).click();await expect(page.getByLabel('Test seller receipt')).toBeVisible();
 await tabs.getByRole('button',{name:'Payment',exact:true}).click();await expect(page.getByLabel('Payment UPI')).toHaveCount(0);await page.getByLabel('Payment Cash',{exact:true}).fill('30');
 const refresh=page.getByRole('button',{name:'Refresh accounting workspace',exact:true});await expect(refresh).toBeEnabled();
 const refreshed=page.waitForResponse(response=>response.request().method()==='POST'&&response.request().postDataJSON()?.input?.method==='getWorkspace');
 await refresh.click();await refreshed;await expect(refresh).toBeEnabled();
 await expect(page.getByLabel('Payment Cash',{exact:true})).toHaveValue('30');
 await page.getByLabel('Payment account type',{exact:true}).selectOption('STOCKIST');
 await expect(page.getByLabel('Payment Cash',{exact:true})).toHaveValue('');
 await page.getByLabel('Payment account type',{exact:true}).selectOption('SELLER');
 await page.getByLabel('Payment Cash',{exact:true}).fill('30');
 const confirmed=page.waitForResponse(response=>{if(response.request().method()!=='POST')return false;const body=response.request().postDataJSON();return body?.operation==='lottery'&&body.input?.method==='recordPayment'&&body.input.payload?.totalAmountPaise==='3000';});
 await page.getByRole('button',{name:/^Receive/}).click();
 const receipt=await confirmed;expect(receipt.ok()).toBe(true);expect((await receipt.json()).data.payment.totalAmountPaise).toBe('3000');
 await expect(page.getByLabel('Payment Cash',{exact:true})).toHaveValue('');
 expect(methods.filter(m=>m==='recordPayment')).toHaveLength(2);
 await page.reload();await expect(page.getByLabel('Accounting organization')).toContainText('Independent lottery');
 await page.getByLabel('Accounting workspace sections').getByRole('button',{name:'Daily entry',exact:true}).click();await expect(page.getByLabel('Test seller dispatch',{exact:true})).toHaveValue('100');
 const result=await runLottery(state,{method:'getWorkspace',payload:{organizationId:(await runLottery(state,{method:'listOrganizations',payload:{}},customer.orbisIdentityId)).result[0].id}},customer.orbisIdentityId,()=>new Date('2026-10-30T10:00:00Z'));
 expect(result.result.draftSales).toHaveLength(1);expect(result.result.draftSales[0]).toMatchObject({grossSalesPaise:'80000',tdsPaise:'80',netPayablePaise:'76080'});expect(result.result.payments).toHaveLength(2);expect(result.result.payments.some((p:any)=>p.methodSplit.pwtPaise==='2000'&&p.methodSplit.cashPaise==='10000'&&p.methodSplit.bankPaise==='5000')).toBe(true);expect(result.result.summary.methodBalances).toMatchObject({cashPaise:'13000',bankPaise:'5000',pwtPaise:'2000'});expect(result.result.parties.find((p:any)=>p.name==='Test seller').openingBalancePaise).toBe('50000');
 await page.getByLabel('Accounting workspace sections').getByRole('button',{name:'Dashboard',exact:true}).click();
 await expect(page.locator('.orbis-public-money-panel')).toHaveCount(0);
 const header=page.locator('header.module-heading');await expect(header.getByRole('combobox')).toBeVisible();await expect(header.getByLabel('More options')).toBeVisible();
 await header.getByRole('combobox').selectOption('bn');await expect(header.getByRole('heading')).toHaveText('ORBIS · লটারি');await header.getByRole('combobox').selectOption('en');
 await header.getByLabel('More options').click();await expect(header.getByRole('checkbox',{name:'Tutorial'})).toBeVisible();await header.getByLabel('More options').click();
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);expect((await header.boundingBox())!.y).toBeGreaterThanOrEqual(0);expect((await header.boundingBox())!.y).toBeLessThan(40);
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);await page.screenshot({path:test.info().outputPath('lottery-home.png')});
 await page.getByRole('button',{name:/^Cash.*₹180.00/}).click();await page.getByRole('button',{name:/^Cash.*₹130.00/}).click();await expect(page.getByRole('table').getByText('Test seller',{exact:true})).toHaveCount(2);
 await expect(page.getByRole('table').getByText('₹130.00',{exact:true}).last()).toBeVisible();
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));expect((await header.boundingBox())!.y).toBeGreaterThanOrEqual(0);expect((await header.boundingBox())!.y).toBeLessThan(40);
 await page.screenshot({path:test.info().outputPath('lottery-cash.png'),fullPage:true});
 await page.getByRole('button',{name:/Back/}).click();await page.getByRole('button',{name:/Back/}).click();
 await page.getByLabel('Accounting workspace sections').getByRole('button',{name:'Ledger',exact:true}).click();await page.screenshot({path:test.info().outputPath('lottery-ledger.png'),fullPage:true});
 await page.locator('.module-picker summary').click();await page.getByRole('navigation',{name:'Choose module'}).getByRole('button',{name:/Khata/}).click();await expect(page.getByRole('region',{name:'Khata Boi',exact:true})).toBeVisible();await page.locator('.module-picker summary').click();await page.getByRole('navigation',{name:'Choose module'}).getByRole('button',{name:/Lottery/}).click();await expect(page.getByLabel('Accounting organization')).toContainText('Independent lottery');
 expect(await page.locator('.lottery-module').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
