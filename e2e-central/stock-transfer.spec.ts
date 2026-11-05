import {test,expect} from '@playwright/test';
import {translations} from '../src/i18n';
import {booksLabels} from '../src/books-navigation';
import {defaultSettings} from '../src/accounting/workspace-contract';
for(const language of ['en','bn','hi'] as const){
 test(`stock values, direct input, optional godown and payment preview (${language})`,async({page})=>{
 const l=(bn:string,hi:string,en:string)=>({bn,hi,en})[language];
 const company='22222222-2222-4222-8222-222222222222',item='33333333-3333-4333-8333-333333333333',warehouse='44444444-4444-4444-8444-444444444444',party='55555555-5555-4555-8555-555555555555',profileId='66666666-6666-4666-8666-666666666666',category='77777777-7777-4777-8777-777777777777';
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'};
 let stock=20000000n;const warehouses=[{id:warehouse,name:'Main',code:'M'}],items=[{id:item,company,name:'Feed',code:'F',unit:'kg'}],parties=[{id:party,name:'Trader',kind:'both',receivable:'10000',payable:'5000'}];
 const documents=[{id:'88888888-8888-4888-8888-888888888888',company,kind:'purchase',date:'2026-11-01',total:'60000',reversed:false,lines:[{item,warehouse,to:null,quantity:'20000000',rate:'3000'}]}];
 const profiles={categories:[{id:category,name:'Salary'}],profiles:[{id:profileId,categoryId:category,name:'Worker',opening:'0',openingDate:'2026-11-01',schedule:{kind:'SALARY',mode:'CALENDAR',start:'2026-11-01',amount:'100000',changes:[]}}],payments:[]};
 const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
 await page.clock.setFixedTime(new Date('2026-11-30T10:00:00Z'));
 await page.addInitScript(({customer,language})=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1',language);},{customer,language});
 await page.route('https://admin.example.test/**',route=>route.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return;}
  const {operation,input}=route.request().postDataJSON();let data:unknown;
  if(operation==='companies')data=[{id:company,name:'Stock fixture'}];
  if(operation==='masters')data={parties,items};
  if(operation==='report')data={balances:{},ledger_balances:{},parties,entries:[],count:0,as_of:'2026-11-30'};
  if(operation==='expense-report')data={balances:{},categories:[],bills:[],entries:[],count:0};
  if(operation==='inventory-report')data={items,warehouses,stocks:[{item,warehouse,closing:String(stock),incoming:String(stock),outgoing:'0',opening:'0'}],documents,count:documents.length};
  if(operation==='retired-companies')data=[];
  if(operation==='party-balance')data=input.kind==='sale'?'10000':'5000';
  if(operation==='expense-profiles')data=profiles;
  if(operation==='workspace'){
   data={...defaultSettings(),production:true};
   if(input.action==='production'){expect(input.kind).toBe('input');expect(input.quantity).toBe('15000000');stock-=BigInt(input.quantity);documents.push({id:input.id,company,kind:'production-input',date:input.date,total:'0',reversed:false,lines:[{item,warehouse,to:null,quantity:input.quantity,rate:'0'}]});data={};}
  }
  if(operation==='inventory-post'){expect(input.kind).toBe('warehouse');warehouses.push({id:input.id,name:input.name,code:input.code});data=input.id;}
  expect(data,'Unexpected '+operation).toBeDefined();await route.fulfill({headers,json:{data}});
 });
 const menu=l('আরও বিকল্প','अन्य विकल्प','More options');
 await page.goto('/');await page.getByRole('button',{name:new RegExp(translations[language].khata)}).click();await page.getByLabel(menu).click();await page.locator('.workspace-menu-panel').getByRole('button',{name:l('স্টক ট্রান্সফার','स्टॉक ट्रांसफर','Stock transfer'),exact:true}).click();
 const stockPage=page.locator('.stock-workspace');await expect(stockPage.locator('tfoot')).toContainText('₹600.00');await expect(stockPage.getByRole('cell',{name:'20',exact:true})).toBeVisible();
 await stockPage.getByRole('combobox',{name:l('আইটেম','आइटम','Item'),exact:true}).selectOption(item);await stockPage.getByLabel(l('পরিমাণ','मात्रा','Quantity'),{exact:true}).fill('15');await stockPage.getByRole('button',{name:l('সেভ করুন','सहेजें','Save'),exact:true}).click();await expect(stockPage.locator('tfoot')).toContainText('₹150.00');
 await stockPage.getByText(l('+ গোডাউন তৈরি করুন','+ गोदाम बनाएँ','+ Create godown'),{exact:true}).click();await stockPage.getByLabel(l('গোডাউনের নাম','गोदाम का नाम','Godown name')).fill('Shop');await stockPage.getByRole('button',{name:l('গোডাউন যোগ করুন','गोदाम जोड़ें','Add godown')}).click();await expect(stockPage.getByRole('combobox',{name:l('গোডাউন','गोदाम','Godown'),exact:true}).getByRole('option',{name:'Shop'})).toHaveCount(1);
 await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('stock-values-'+language+'.png'),fullPage:true});
 await page.getByLabel(menu).click();await page.locator('.workspace-menu-panel').getByRole('button',{name:booksLabels[language].ledger,exact:true}).click();
 const payment=page.locator('.workspace-settings').filter({has:page.getByRole('heading',{name:l('জমা / পেমেন্ট','जमा / भुगतान','Receive / pay'),exact:true})});
 await payment.getByRole('combobox',{name:l('পার্টি','पार्टी','Party'),exact:true}).selectOption(party);await payment.getByLabel(l('টাকা','रकम','Amount'),{exact:true}).fill('25.50');await expect(payment.locator('.outstanding-preview')).toContainText('₹74.50');
 await payment.getByRole('combobox',{name:l('ধরন','प्रकार','Type'),exact:true}).selectOption('payment');await payment.getByRole('combobox',{name:l('পার্টি','पार्टी','Party'),exact:true}).selectOption(party);await payment.getByLabel(l('টাকা','रकम','Amount'),{exact:true}).fill('60');await expect(payment.locator('.outstanding-preview')).toContainText('₹10.00');
 await payment.getByRole('combobox',{name:l('ধরন','प्रकार','Type'),exact:true}).selectOption('expense');await payment.getByRole('combobox',{name:l('কাকে দেওয়া','किसे दिया','Paid to'),exact:true}).selectOption(profileId);await payment.getByLabel(l('টাকা','रकम','Amount'),{exact:true}).fill('200');await expect(payment.locator('.outstanding-preview')).toContainText('₹800.00');
 await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('outstanding-'+language+'.png'),fullPage:true});
 });
}
