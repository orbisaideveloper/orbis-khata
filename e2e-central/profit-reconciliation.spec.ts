import {translations} from '../src/i18n';
import {test,expect} from '@playwright/test';
import {defaultSettings} from '../src/accounting/workspace-contract';
import {inLanguage} from '../src/localize';
for(const language of ['bn','en','hi'] as const){
 test(`profit stays visible and reconciles batch output on refresh (${language})`,async({page})=>{
  const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
  const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'};
  const company='22222222-2222-4222-8222-222222222222',milk='33333333-3333-4333-8333-333333333333',feed='44444444-4444-4444-8444-444444444444';
  const items=[{id:milk,name:'Milk',unit:'litre',code:'M'},{id:feed,name:'Feed',unit:'kg',code:'F'}];
  const sale={id:'55555555-5555-4555-8555-555555555555',company,kind:'sale',date:'2026-11-01',reference:'S1',total:'10000',reversed:false,party:null,party_name:null,lines:[{item:milk,warehouse:'w',to:null,quantity:'1000000',rate:'10000'}]};
  const purchase={...sale,id:'66666666-6666-4666-8666-666666666666',kind:'purchase',date:'2026-11-02',total:'12000',lines:[{...sale.lines[0],item:feed,quantity:'2000000',rate:'6000'}]};
  const input={...purchase,id:'77777777-7777-4777-8777-777777777777',kind:'production-input',total:'0',lines:[{...purchase.lines[0],quantity:'1000000',rate:'0'}]};
  const output={...sale,id:'88888888-8888-4888-8888-888888888888',kind:'production-output',date:'2026-11-03',total:'0',lines:[{...sale.lines[0],rate:'0'}]};
  const trade={entries:[{id:sale.id,kind:'sale',effective_date:sale.date,amount_minor:'10000',party_id:null,party_name:'Buyer',reference:'S1',note:'',debit_account:'receivable',credit_account:'sales',reversed:false}],parties:[],balances:{},ledger_balances:{},count:1,as_of:'2026-11-03'};
  let updated=false;
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00Z'));
  await page.addInitScript(({customer,language})=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1',language);},{customer,language});
  await page.route('https://admin.example.test/**',r=>r.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
  await page.route('https://data.example.test/**',async route=>{
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
   const {operation,input:command}=route.request().postDataJSON();let data:unknown;
   if(operation==='companies')data=[{id:company,name:'Report fixture'}];
   if(operation==='masters')data={items,parties:[]};
   if(operation==='report')data=trade;
   if(operation==='expense-report')data={entries:[],bills:[],categories:[],balances:{},count:0};
   if(operation==='inventory-report'){const documents=updated?[sale,purchase,input,output]:[sale];data={items,documents,count:documents.length,stocks:[],warehouses:[]};}
   if(operation==='workspace')data=command.action==='settings'?{...defaultSettings(),production:true}:null;
   if(operation==='retired-companies')data=[];
   expect(data,'Unexpected read '+operation).toBeDefined();await route.fulfill({headers,json:{data}});
  });
  await page.goto(process.env.KHATA_PROFIT_PREVIEW_URL??'/');await page.getByRole('button',{name:new RegExp(translations[language].khata)}).click();
  await page.getByRole('button',{name:new RegExp(l('দিনের হিসাব','दिन का हिसाब','Daily summary'))}).click();
  await page.getByRole('button',{name:l('এই মাস','इस महीने','This month'),exact:true}).click();
  const reports=page.locator('.business-reports');
  await expect(reports.locator('.profit-total')).toContainText('₹100.00');
  await expect(reports.locator('.profit-total')).toContainText(l('অস্থায়ী','अस्थायी','Provisional'));
  await expect(reports.getByText(new RegExp(l('মাইনাস stock:','ऋणात्मक स्टॉक:','Negative stock:')))).toContainText('Milk -1 litre');
  await page.screenshot({path:test.info().outputPath(`provisional-${language}.png`),fullPage:true});
  updated=true;await reports.getByRole('button',{name:l('রিপোর্ট আপডেট করুন','रिपोर्ट अपडेट करें','Refresh report')}).click();
  await expect(reports.locator('.profit-total')).toContainText('₹40.00');await expect(reports.locator('.profit-total')).not.toContainText(l('অস্থায়ী','अस्थायी','Provisional'));
  await reports.locator('.profit-inventory summary').click();await expect(reports.locator('.profit-inventory')).toContainText('₹60.00');await expect(reports.locator('.profit-stock-row')).toContainText('Feed');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`reconciled-${language}.png`),fullPage:true});
 });
}
