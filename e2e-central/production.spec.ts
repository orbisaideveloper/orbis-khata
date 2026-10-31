import {test,expect} from '@playwright/test';
import {defaultSettings} from '../src/accounting/workspace-contract';
test('company production mode routes purchases and receives own milk without duplicate posting',async({page})=>{
 const company='22222222-2222-4222-8222-222222222222',warehouse='44444444-4444-4444-8444-444444444444',feed='55555555-5555-4555-8555-555555555555',milk='66666666-6666-4666-8666-666666666666',party='33333333-3333-4333-8333-333333333333';
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'};
 let settings=defaultSettings(),saves=0;
 const docs:Record<string,unknown>[]=[],items=[{id:feed,company,name:'Feed',unit:'bag',code:'F'},{id:milk,company,name:'Milk',unit:'litre',code:'M'}];
 const headers={'access-control-allow-origin':'http://127.0.0.1:4187','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
 await page.clock.setFixedTime(new Date('2026-10-31T10:00:00Z'));
 await page.addInitScript(customer=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1','en');},customer);
 await page.route('https://admin.example.test/**',r=>r.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return;}
  const {operation,input}=route.request().postDataJSON();let data:unknown;
  if(operation==='companies')data=[{id:company,name:'Production farm'}];
  if(operation==='masters')data={parties:[{id:party,company,name:'Supplier',kind:'supplier',receivable:'0',payable:'0'}],items};
  if(operation==='party-balance')data='0';
  if(operation==='report')data={balances:{},ledger_balances:{},parties:[],entries:[],count:0,as_of:'2026-10-31'};
  if(operation==='expense-report')data={balances:{},categories:[],bills:[],entries:[],count:0};
  if(operation==='inventory-report')data={items,warehouses:[{id:warehouse,name:'Main',code:'MAIN'}],stocks:[],documents:docs,count:docs.length};
  if(operation==='retired-companies')data=[];
  if(operation==='workspace'){
   if(input.action==='settings')data=settings;
   if(input.action==='accounts')data=[];
   if(input.action==='settings-save'){settings=input.settings;data=settings;}
   if(input.action==='number-preview')data='1';
   if(input.action==='invoice-save'){expect(input.production).toBe(true);saves++;const bill={...input.command.bill,total:'2500000',reversed:false,party_name:'Supplier'};docs.push(bill,{...bill,id:'77777777-7777-4777-8777-777777777777',kind:'production-input',total:'0',party:null});data={id:bill.id,reference:'1'};}
   if(input.action==='production'){expect(input).toMatchObject({kind:'output',item:milk,quantity:'500000000'});saves++;docs.push({id:input.id,company,kind:'production-output',date:input.date,reference:'',note:input.note,total:'0',reversed:false,party:null,party_name:null,lines:[{item:milk,warehouse,to:null,quantity:input.quantity,rate:'0'}]});data={id:input.id};}
  }
  expect(data).toBeDefined();await route.fulfill({headers,json:{data}});
 });
 await page.goto('/');await page.getByRole('button',{name:/Khata Boi.*Open/}).click();
 const nav=page.getByRole('navigation',{name:'Main navigation'});await expect(page.getByRole('button',{name:'Production',exact:true})).toHaveCount(0);
 await page.getByLabel('More options').click();await page.locator('.workspace-menu-panel').getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Enable production mode').check();await page.getByRole('button',{name:'Save settings',exact:true}).click();await expect(page.getByText('Settings saved.',{exact:true})).toBeVisible();await page.getByLabel('More options').click();const menu=page.locator('.workspace-menu');await expect(menu.getByRole('button',{name:'Production',exact:true})).toBeVisible();await page.screenshot({path:test.info().outputPath('production-menu.png'),fullPage:true});await page.locator('.kh-brand').click();await expect(menu).not.toHaveAttribute('open');
 await nav.getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'Purchase',exact:true}).click();
 await page.getByRole('combobox',{name:'Party',exact:true}).selectOption(party);await page.getByLabel('Item name 1').selectOption(feed);await page.getByLabel('Quantity 1').fill('500');await page.getByLabel('Rate 1').fill('50');await page.getByLabel('Send to production').check();await page.getByRole('button',{name:'Review bill',exact:true}).click();await page.getByRole('button',{name:'Confirm & save',exact:true}).click();await expect(page.getByText('Bill saved.',{exact:true})).toBeVisible();
 await page.getByLabel('More options').click();await page.locator('.workspace-menu-panel').getByRole('button',{name:'Production',exact:true}).click();await expect(page.locator('.workspace-menu')).not.toHaveAttribute('open');const production=page.locator('.production-page');await production.getByRole('combobox',{name:'Type',exact:true}).selectOption('output');await production.getByRole('combobox',{name:'Item',exact:true}).selectOption(milk);await production.getByLabel('Quantity',{exact:true}).fill('500');await production.getByRole('button',{name:'Review',exact:true}).click();await production.getByRole('button',{name:'Confirm & save',exact:true}).click();await expect(production.getByText('₹50.00 / litre',{exact:true})).toBeVisible();expect(saves).toBe(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('production.png'),fullPage:true});
 await page.getByLabel('More options').click();await page.locator('.workspace-menu-panel').getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Enable production mode').uncheck();await page.getByRole('button',{name:'Save settings',exact:true}).click();await expect(page.getByRole('button',{name:'Production',exact:true})).toHaveCount(0);expect(docs).toHaveLength(3);
 await page.getByLabel('More options').click();await page.getByRole('button',{name:'Main home',exact:true}).click();await expect(page.getByRole('button',{name:/Khata Boi.*Open/})).toBeVisible();
 await page.getByLabel('More options').click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.getByRole('button',{name:'New · blue',exact:true}).click();await expect(page.locator('main.phone')).toHaveAttribute('data-theme','smart');await page.screenshot({path:test.info().outputPath('new-blue-home.png'),fullPage:true});
 await page.reload();await page.getByLabel('More options').click();await page.getByRole('button',{name:'Appearance',exact:true}).click();await expect(page.getByRole('button',{name:'New · blue'})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Glass · green'}).click();await expect(page.locator('main.phone')).toHaveAttribute('data-theme','glass');expect(saves).toBe(2);

});
