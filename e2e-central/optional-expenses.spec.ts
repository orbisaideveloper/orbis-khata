import {test,expect} from '@playwright/test';
import {defaultSettings} from '../src/accounting/workspace-contract';
import {emptyProfiles,profileCommand,runProfiles,type ProfileCommand} from '../src/expense-profiles/model';
import {translations} from '../src/i18n';
import {inLanguage} from '../src/localize';
for(const language of ['en','bn','hi'] as const)test(`one-row optional expense schedule and real payments (${language})`,async({page})=>{
 const l=(bn:string,hi:string,en:string)=>inLanguage(language,bn,hi,en),day='2026-11-30',company={id:'22222222-2222-4222-8222-222222222222',name:'Schedule fixture'},customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'};
 let state=emptyProfiles(),journal:Record<string,unknown>[]=[],accept=true;
 const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
 await page.clock.setFixedTime(new Date(day+'T10:00:00Z'));page.on('dialog',async dialog=>{if(accept)await dialog.accept();else await dialog.dismiss();});
 await page.addInitScript(({customer,language})=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1',language);},{customer,language});
 await page.route('https://admin.example.test/**',route=>route.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return;}
  const {operation,input}=route.request().postDataJSON();let data:unknown;
  if(operation==='companies')data=[company];if(operation==='masters')data={parties:[],items:[]};if(operation==='retired-companies')data=[];
  if(operation==='report')data={parties:[],entries:[],balances:{},ledger_balances:{},count:0,as_of:day};
  if(operation==='expense-report')data={balances:{},categories:[],bills:[],entries:journal.map(row=>({...row,effective_date:row.date,parent_id:null,reverses_id:null,reversed:false})),count:journal.length};
  if(operation==='inventory-report')data={items:[],warehouses:[],stocks:[],documents:[],count:0};if(operation==='workspace'&&input.action==='settings')data=defaultSettings();
  if(operation==='expense-profiles'){expect(input.company).toBe(company.id);expect(profileCommand(input)).toBe(true);state=await runProfiles(state,input as ProfileCommand,async row=>{journal.push(row);});data=state;}
  expect(data,'Unexpected '+operation).toBeDefined();await route.fulfill({headers,json:{data}});
 });
 await page.goto('/');await page.getByRole('button',{name:new RegExp(translations[language].khata)}).click();
 async function openExpenses(){await page.getByLabel(l('আরও বিকল্প','अन्य विकल्प','More options')).click();await page.locator('.workspace-menu-panel').getByRole('button',{name:l('খরচ','खर्च','Expenses'),exact:true}).click();}
 await openExpenses();const expenses=page.getByRole('region',{name:l('ব্যবসার খরচ','व्यवसाय के खर्च','Business expenses'),exact:true});
 const category=expenses.getByLabel(l('ক্যাটাগরি','श्रेणी','Category'),{exact:true}),subcategory=expenses.getByLabel(l('সাব-ক্যাটাগরি','उप-श्रेणी','Subcategory'),{exact:true}),payee=expenses.getByLabel(l('কাকে দেওয়া / কার কাছে বাকি','किसे दिया / किसे देना है','Paid to / owed to'),{exact:true});
 await category.fill('Delivery');await subcategory.fill('Milk');await payee.fill('Worker');
 const toggle=expenses.getByRole('checkbox',{name:l('মাসিক / নির্ধারিত হিসাব রাখুন','मासिक / निर्धारित हिसाब रखें','Track monthly / scheduled payments')});await expect(toggle).not.toBeChecked();await expect(expenses.getByLabel('Expense schedule',{exact:true})).toHaveCount(0);
 await toggle.check();await expect(expenses.getByLabel('Expense schedule',{exact:true})).toBeVisible();await expect(category).toHaveValue('Delivery');await expect(subcategory).toHaveValue('Milk');await expect(payee).toHaveValue('Worker');
 const size=await toggle.boundingBox();expect(size!.width).toBeLessThanOrEqual(20);expect(size!.height).toBeLessThanOrEqual(20);expect((await expenses.locator('.expense-schedule-toggle').boundingBox())!.height).toBeLessThan(44);
 await toggle.uncheck();await expect(expenses.getByLabel('Expense schedule',{exact:true})).toHaveCount(0);await expect(payee).toHaveValue('Worker');expect(journal).toHaveLength(0);await toggle.check();
 await expenses.getByLabel('Expense type',{exact:true}).selectOption('SALARY');await expenses.getByLabel('Profile amount',{exact:true}).fill('100');await expenses.getByLabel('Schedule start',{exact:true}).fill('2026-11-01');await page.screenshot({path:test.info().outputPath('optional-schedule.png'),fullPage:true});await expenses.getByRole('button',{name:l('সেভ','सहेजें','Save'),exact:true}).click();await expenses.getByRole('button',{name:/Worker/}).click();expect(journal).toHaveLength(0);
 await expenses.getByLabel('Profile payment amount').fill('150');accept=false;await expenses.getByRole('button',{name:l('পেমেন্ট সেভ','भुगतान सहेजें','Save payment'),exact:true}).click();expect(journal).toHaveLength(0);accept=true;await expenses.getByRole('button',{name:l('পেমেন্ট সেভ','भुगतान सहेजें','Save payment'),exact:true}).click();await expect(expenses.getByText(l('Advance','अग्रिम','Advance')+': ₹50.00',{exact:true})).toBeVisible();expect(journal).toHaveLength(1);expect(journal[0]).toMatchObject({amount:'15000',category:'Delivery › Milk',payee:'Worker',method:'cash'});await expect(expenses.getByRole('button',{name:l('ডিলিট','मिटाएँ','Delete'),exact:true})).toBeDisabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.reload();await openExpenses();await category.fill('Delivery');await toggle.check();await expect(expenses.getByRole('button',{name:/Worker/})).toBeVisible();expect(journal).toHaveLength(1);
});
