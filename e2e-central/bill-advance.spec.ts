import {test,expect} from '@playwright/test';
import {defaultSettings} from '../src/accounting/workspace-contract';
test('negative stock and excess bill receipt remain valid, with compact company/modules and precise errors',async({page})=>{
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'};
 const company={id:'22222222-2222-4222-8222-222222222222',name:'Orbis'};
 const party={id:'33333333-3333-4333-8333-333333333333',company:company.id,name:'Shiva Bikaner Sweets',kind:'customer',receivable:'3780000',payable:'0',opening_amount:'0',opening_side:'none',opening_account:'receivable',opening_date:'',phone:'',email:'',address:'',credit_limit:null,credit_days:null};
 const item={id:'44444444-4444-4444-8444-444444444444',company:company.id,name:'Milk',unit:'litre',code:'',default_rate:'5500'},warehouse={id:'55555555-5555-4555-8555-555555555555',name:'Main'};
 const headers={'access-control-allow-origin':'http://127.0.0.1:4187','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
 await page.addInitScript(customer=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1','en');},customer);
 await page.route('https://admin.example.test/**',r=>r.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
 let saves=0;
 await page.route('https://data.example.test/**',async route=>{
 if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
 const {operation,input}=route.request().postDataJSON();let data:unknown;
 if(operation==='companies')data=[company];
 if(operation==='masters')data={parties:[party],items:[item]};
 if(operation==='report')data={balances:{},ledger_balances:{},parties:[party],entries:[],count:0};
 if(operation==='party-balance')data='3780000';
 if(operation==='inventory-report')data={items:[item],warehouses:[warehouse],stocks:[{item:item.id,warehouse:warehouse.id,closing:'-183500000'}],documents:[],count:0};
 if(operation==='expense-report')data={balances:{},categories:[],bills:[],entries:[],count:0};
 if(operation==='workspace'){
 data=input.action==='settings'?defaultSettings():input.action==='number-preview'?'8':null;
 if(input.action==='invoice-save'){expect(input.command).toMatchObject({paid:'300000',roundoff:'-250',bill:{kind:'sale',lines:[{quantity:'45500000',rate:'5500'}]}});saves++;data={id:input.command.bill.id,reference:'8',total:'250000',paid:'300000',due:'-50000'};}
 }
 expect(data).toBeDefined();await route.fulfill({headers,json:{data}});
 });
 await page.goto('/');await page.getByRole('button',{name:/Khata Boi.*Open/}).click();
 await expect(page.locator('.module-switchbar')).toHaveCount(0);
 const row=page.locator('.kh-company-modules');await expect(row.getByLabel('Company')).toBeVisible();await expect(row.getByText('Modules',{exact:false})).toBeVisible();expect(await row.getByLabel('Company').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(90);expect((await row.boundingBox())!.height).toBeLessThan(70);
 await page.getByRole('button',{name:'Sale',exact:true}).click();
 await expect(page.getByLabel('Bill number',{exact:true})).toHaveValue('8');
 await page.getByRole('button',{name:'Review bill',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Choose a party.');
 await page.getByRole('combobox',{name:'Party',exact:true}).selectOption(party.id);await page.getByLabel('Item name 1',{exact:true}).selectOption(item.id);await page.getByLabel('Quantity 1',{exact:true}).fill('45.5');await page.getByLabel('Less / discount',{exact:true}).fill('2.5');await page.getByLabel('Received now',{exact:true}).fill('3000');
 await expect(page.locator('.bill-stock')).toContainText('-229 litre');await expect(page.getByText(/Stock will become negative/)).toHaveCount(0);await expect(page.locator('.bill-payment')).toContainText('−₹500.00');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:test.info().outputPath('negative-stock-advance.png'),fullPage:true});
 await page.getByRole('button',{name:'Review bill',exact:true}).click();await page.getByRole('button',{name:'Confirm & save',exact:true}).click();await expect(page.getByText('Bill saved.',{exact:true})).toBeVisible();expect(saves).toBe(1);
});
