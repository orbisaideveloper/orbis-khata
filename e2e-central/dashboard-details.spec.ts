import {test,expect} from '@playwright/test';
import {defaultSettings} from '../src/accounting/workspace-contract';
import {shareCopy} from '../src/customer-view/copy';
import {translations} from '../src/i18n';
import {inLanguage} from '../src/localize';
for(const language of ['en','bn','hi'] as const){
 test(`expense previews, report drill-down and shared module navigation (${language})`,async({page})=>{
  const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en);
  const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'},company={id:'22222222-2222-4222-8222-222222222222',name:'Navigation fixture'};
  const party={id:'33333333-3333-4333-8333-333333333333',name:'Trader',kind:'both',receivable:'8000',payable:'10000'},item={id:'44444444-4444-4444-8444-444444444444',name:'Milk',unit:'L',code:'M'};
  const day='2026-10-30',purchase={id:'55555555-5555-4555-8555-555555555555',company:company.id,kind:'purchase',date:day,reference:'P1',party:party.id,party_name:party.name,total:'10000',reversed:false,lines:[{item:item.id,warehouse:'w',to:null,quantity:'10000000',rate:'1000'}]},sale={...purchase,id:'66666666-6666-4666-8666-666666666666',kind:'sale',reference:'S1',total:'8000',lines:[{...purchase.lines[0],quantity:'4000000',rate:'2000'}]};
  const entry={id:sale.id,party_id:party.id,party_name:party.name,effective_date:day,reference:'S1',kind:'sale',amount_minor:'8000',debit_account:'receivable',credit_account:'sales',reversed:false,note:''};
  const trade={entries:[entry,{...entry,id:purchase.id,kind:'purchase',reference:'P1',amount_minor:'10000',debit_account:'purchases',credit_account:'payable'}],parties:[party],balances:{expenses:{opening:'0',movement:'1000',closing:'1000'}},ledger_balances:{receivable:{opening:'0',closing:'8000'}},count:2};
  const expenses={entries:[1,2,3,4].map(n=>({id:'e'+n,effective_date:'2026-10-'+(26+n),kind:'charge',payee:'Payee '+n,category:'Travel',amount:String(n*100),method:'cash',parent_id:null,reverses_id:null,reversed:false,reference:'E'+n,note:''})),categories:[{name:'Travel',amount:'1000'}],bills:[],balances:{},count:4};
  const output={...item,id:'77777777-7777-4777-8777-777777777777',name:'Curd',unit:'kg',code:'C'};
  const inputDoc={...purchase,id:'input',kind:'production-input',total:'0',lines:[{...purchase.lines[0],quantity:'4000000',rate:'0'}]},outputDoc={...inputDoc,id:'output',kind:'production-output',lines:[{...inputDoc.lines[0],item:output.id}]};
  let productionEnabled=false;
  const inventory={items:[item,output],warehouses:[{id:'w',name:'Main',code:'MAIN'}],stocks:[{item:item.id,warehouse:'w',opening:'0',incoming:'10000000',outgoing:'4000000',closing:'6000000'}],documents:[purchase,inputDoc,outputDoc,sale],count:4};
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};const reads:{operation:string;input:Record<string,unknown>}[]=[];
  await page.clock.setFixedTime(new Date(day+'T10:00:00Z'));
  await page.addInitScript(({customer,language})=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1',language);},{customer,language});
  await page.route('https://admin.example.test/**',r=>r.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
  await page.route('https://data.example.test/**',async route=>{
   if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return;}
   const {operation,input}=route.request().postDataJSON();reads.push({operation,input});let data:unknown;
   if(operation==='companies')data=[company];
   if(operation==='masters')data={parties:[party],items:[item]};
   if(operation==='report')data=trade;
   if(operation==='expense-report')data=expenses;
   if(operation==='inventory-report')data=inventory;
   if(operation==='workspace'){
    if(input.action==='settings')data={...defaultSettings(),production:productionEnabled};
    if(input.action==='detail')data={voucher:entry,bill:sale,payments:[],company_name:company.name,party_name:party.name,item_names:{[item.id]:item.name}};
   }
   if(operation==='retired-companies'||operation==='party-sharing')data=[];
   if(operation==='lottery'&&input.method==='listOrganizations')data=[];
   expect(data,'Unexpected operation '+operation+JSON.stringify(input)).toBeDefined();await route.fulfill({headers,json:{data}});
  });
  await page.goto('/');await page.getByRole('button',{name:new RegExp(translations[language].khata)}).click();
  const preview=page.locator('.kh-recent-expenses');await expect(preview).toContainText('Payee 4');await expect(preview).toContainText('Payee 3');await expect(preview).toContainText('Payee 2');await expect(preview).not.toContainText('Payee 1');
  await page.screenshot({path:test.info().outputPath('expense-preview.png'),fullPage:true});
  await page.getByRole('button',{name:new RegExp(l('দিনের হিসাব','दिन का हिसाब','Daily summary'))}).click();
  const reports=page.getByRole('region',{name:l('ব্যবসার রিপোর্ট','व्यापार रिपोर्ट','Business reports')});
  await expect(reports.locator('.profit-basis')).toContainText(l('স্বাভাবিক হিসাব','सामान्य हिसाब','Normal accounts'));await expect(reports.locator('.profit-total')).toContainText('₹30.00');await expect(reports.locator('.profit-simple')).toContainText('−₹30.00');
  await reports.getByRole('button',{name:l('বিক্রয়','बिक्री','Sales'),exact:true}).click();await expect(reports.getByRole('combobox')).toHaveValue('sale');
  await reports.getByRole('button',{name:'Trader',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Milk',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Milk',exact:true})).toBeVisible();
  const back=l('তালিকায় ফিরুন','सूची पर लौटें','Back to list');await dialog.getByRole('button',{name:back,exact:true}).click();await dialog.getByRole('button',{name:'Trader',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Trader',exact:true})).toBeVisible();
  expect(reads.some(r=>r.operation==='report'&&r.input.party===party.id&&r.input.company===company.id)).toBe(true);
  await dialog.getByRole('button',{name:back,exact:true}).click();await dialog.getByRole('button',{name:l('বন্ধ করুন','बंद करें','Close'),exact:true}).click();
  await reports.getByRole('button',{name:l('সারাংশ / লাভ','सारांश / लाभ','Summary / profit'),exact:true}).click();await reports.getByRole('button',{name:l('খরচ','खर्च','Expenses'),exact:true}).click();await expect(reports.getByRole('combobox')).toHaveValue('expenses');await expect(reports.getByRole('button',{name:'Payee 4'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.locator('.module-picker>summary').click();await page.getByRole('navigation',{name:l('মডিউল বাছুন','मॉड्यूल चुनें','Choose module')}).getByRole('button',{name:shareCopy(language,'title'),exact:true}).click();
  await expect(page.getByRole('heading',{name:shareCopy(language,'title')})).toBeVisible();await page.locator('.module-picker>summary').click();await page.getByRole('navigation',{name:l('মডিউল বাছুন','मॉड्यूल चुनें','Choose module')}).getByRole('button',{name:translations[language].khata,exact:true}).click();
  await expect(page.getByRole('combobox',{name:l('কোম্পানি','कंपनी','Company'),exact:true})).toHaveValue(company.id);await page.reload();await expect(page.getByRole('combobox',{name:l('কোম্পানি','कंपनी','Company'),exact:true})).toHaveValue(company.id);
  productionEnabled=true;await page.reload();await page.getByRole('button',{name:new RegExp(l('দিনের হিসাব','दिन का हिसाब','Daily summary'))}).click();
  await expect(reports.locator('.profit-production')).toContainText('Curd');await expect(reports.locator('.profit-production')).toContainText('₹10.00');await expect(reports.locator('.profit-total')).toContainText('₹30.00');await expect(reports.locator('.profit-simple')).toContainText('−₹30.00');await expect(reports.locator('.profit-production')).toContainText(day);
  await page.screenshot({path:test.info().outputPath('profit-production.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  productionEnabled=false;await page.reload();await page.getByRole('button',{name:new RegExp(l('দিনের হিসাব','दिन का हिसाब','Daily summary'))}).click();await expect(reports.locator('.profit-total')).toContainText('₹30.00');await expect(reports.locator('.profit-production')).toHaveCount(0);
  expect(reads.every(r=>r.operation!=='workspace'||['settings','detail'].includes(String(r.input.action)))).toBe(true);
 });
}
